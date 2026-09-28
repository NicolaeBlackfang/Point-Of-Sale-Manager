const Product = require('../models/Product');
const QRCode = require('qrcode');

// @desc    Get all active products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
  try {
    let query = { isDeleted: false };

    // If the logged in user is an Operator, restrict results to their uploaded products
    if (req.user.role === 'Operator') {
      query.createdByOperatorId = req.user._id;
    }

    const products = await Product.find(query).populate('createdByOperatorId', 'name username roleTakerName');
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get product by scanned QR payload or SKU
// @route   GET /api/products/scan/:qrData
// @access  Private
const getProductByQrData = async (req, res) => {
  try {
    const rawData = decodeURIComponent(req.params.qrData || '').trim();

    if (!rawData || rawData === 'undefined' || rawData === 'null') {
      return res.status(400).json({ message: 'Invalid SKU or QR Code payload provided.' });
    }

    let skuToSearch = rawData;

    try {
      const parsed = JSON.parse(rawData);
      if (parsed.sku) skuToSearch = parsed.sku;
    } catch {
      // Raw SKU string format
    }

    const product = await Product.findOne({
      sku: { $regex: new RegExp(`^${skuToSearch}$`, 'i') },
      isDeleted: false,
    })
      .populate('createdByOperatorId', 'username roleTakerName name role')
      .populate('stockHistory.performedBy', 'username roleTakerName name role');

    if (!product) {
      return res.status(404).json({ message: `No active product found matching SKU or QR code: "${skuToSearch}"` });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a product & generate QR code
// @route   POST /api/products
// @access  Private (Operator, Superadmin)
const createProduct = async (req, res) => {
  try {
    const { sku, name, category, price, stockQuantity, branchNumber } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ message: 'SKU and product name are required.' });
    }

    const cleanSku = sku.toUpperCase().trim();

    const existingProduct = await Product.findOne({ sku: cleanSku });
    if (existingProduct) {
      return res.status(400).json({ message: 'Product with this SKU already exists.' });
    }

    // 1. Generate the raw QR code string payload
    const qrPayload = JSON.stringify({ sku: cleanSku, name });

    // 2. Generate the base64 QR Code image Data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload);

    // 3. Create product with both qrPayload and qrCodeDataUrl
    const product = await Product.create({
      sku: cleanSku,
      name,
      category,
      price,
      stockQuantity,
      branchNumber: branchNumber || req.user.branchNumber || '101',
      qrPayload,       // <--- Fixes: Path `qrPayload` is required
      qrCodeDataUrl,
      createdByOperatorId: req.user._id,
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update product details
// @route   PUT /api/products/:id
// @access  Private (Operator, Superadmin)
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.name = req.body.name || product.name;
    product.category = req.body.category || product.category;
    product.price = req.body.price !== undefined ? req.body.price : product.price;
    product.stockQuantity = req.body.stockQuantity !== undefined ? req.body.stockQuantity : product.stockQuantity;
    product.branchNumber = req.body.branchNumber || product.branchNumber;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Adjust product stock quantity and record stock history audit log
// @route   PUT /api/products/:id/stock
// @access  Private (Operator, Superadmin)
const updateStock = async (req, res) => {
  try {
    const { quantityChanged, adjustmentType, reason } = req.body;
    const userId = req.user._id;

    const qty = parseInt(quantityChanged, 10);
    if (!qty || qty <= 0) {
      return res.status(400).json({ message: 'Quantity changed must be a positive integer.' });
    }

    const type = (adjustmentType || 'ADDITION').toUpperCase();
    if (!['ADDITION', 'DEDUCTION', 'CORRECTION'].includes(type)) {
      return res.status(400).json({ message: 'Invalid adjustment type.' });
    }

    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found or soft-deleted.' });
    }

    const previousQuantity = product.stockQuantity;
    let delta = qty;

    if (type === 'DEDUCTION') {
      if (qty > previousQuantity) {
        return res.status(400).json({ message: `Cannot deduct ${qty} units. Current stock is ${previousQuantity}.` });
      }
      delta = -qty;
    } else if (type === 'CORRECTION') {
      // For correction, quantityChanged can represent the exact stock diff
      delta = qty - previousQuantity;
    }

    const newQuantity = previousQuantity + delta;

    // Atomically increment stock and push stockHistory adjustment entry matching schema
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { stockQuantity: delta },$push: {
          stockHistory: {
            adjustmentType: type,
            quantityChanged: Math.abs(qty),
            previousQuantity,
            newQuantity,
            reason: reason || 'Manual Inventory Adjustment',
            performedBy: userId,
            timestamp: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    )
      .populate('createdByOperatorId', 'username roleTakerName name role')
      .populate('deletedBy', 'username roleTakerName name role')
      .populate('stockHistory.performedBy', 'username roleTakerName name role');

    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Soft-delete product with timestamp and deleter user ID
// @route   DELETE /api/products/:id
// @access  Private (Superadmin, Operator)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = req.user._id;

    await product.save();

    res.json({ message: 'Product removed successfully', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get audit logs (includes deleted products & populated user history)
// @route   GET /api/products/audit/logs
// @access  Private (Superadmin)
const getAuditLogs = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('createdByOperatorId', 'username roleTakerName name role')
      .populate('deletedBy', 'username roleTakerName name role')
      .populate('stockHistory.performedBy', 'username roleTakerName name role')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductByQrData,
  createProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  getAuditLogs,
};