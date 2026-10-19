const Product = require('../models/Product');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const { escapeRegex } = require('../utils/validators');
const { logAudit } = require('../utils/audit');
const { checkLowStock } = require('../utils/lowStock');
const cache = require('../utils/cache');

const PRODUCT_LIST_TTL_MS = 15000;

// Keep the embedded stock-adjustment history bounded so it cannot grow without
// limit (embedded arrays cannot use a TTL index). Older entries are trimmed on
// each write; Superadmins can also purge on demand.
const STOCK_HISTORY_LIMIT = 500;

// Invalidate every cached product list (called after any stock/name change,
// including from the sales flow).
function invalidateProductCache() {
  cache.invalidate('products:');
}

const canManageProduct = (user, product) => {
  if (!product) return false;
  if (user.role === 'Superadmin') return true;

  // Non-superadmins may only mutate products they created, and only while the
  // product belongs to their own branch (branch-scoped authorization). If a
  // branch is not recorded on either side, fall back to ownership alone.
  const owns = String(product.createdByOperatorId) === String(user._id);
  if (!owns) return false;
  if (!user.branchNumber || !product.branchNumber) return true;
  return String(product.branchNumber) === String(user.branchNumber);
};

// @desc    Get all active products (optional ?q= name/sku/barcode search)
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
  try {
    const query = { isDeleted: false };

    // If the logged in user is an Operator, restrict results to their uploaded products
    if (req.user.role === 'Operator') {
      query.createdByOperatorId = req.user._id;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { description: rx }];
    }

    const cacheKey = `products:list:${req.user._id}:${req.user.role}:${q}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const products = await Product.find(query)
      .populate('createdByOperatorId', 'name username roleTakerName')
      .lean();

    cache.set(cacheKey, products, PRODUCT_LIST_TTL_MS);
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Distinct product categories (for filters/dropdowns)
// @route   GET /api/products/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const cacheKey = `products:categories:${req.user.role === 'Operator' ? req.user._id : 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const filter = { isDeleted: false };
    if (req.user.role === 'Operator') filter.createdByOperatorId = req.user._id;

    const categories = await Product.distinct('category', filter);
    const payload = categories
      .map((category) => String(category || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    cache.set(cacheKey, payload, PRODUCT_LIST_TTL_MS);
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
      if (parsed.sku) skuToSearch = String(parsed.sku);
    } catch {
      // Raw SKU string format
    }

    if (!skuToSearch || skuToSearch === 'undefined' || skuToSearch === 'null') {
      return res.status(400).json({ message: 'Invalid SKU or QR Code payload provided.' });
    }

    const product = await Product.findOne({
      sku: { $regex: new RegExp(`^${escapeRegex(skuToSearch)}$`, 'i') },
      isDeleted: false,
    })
      .populate('createdByOperatorId', 'username roleTakerName name role')
      .populate('stockHistory.performedBy', 'username roleTakerName name role');

    if (!product) {
      return res.status(404).json({ message: 'No active product found matching that SKU or QR code.' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Create a product & generate QR code
// @route   POST /api/products
// @access  Private (Operator, Superadmin)
const createProduct = async (req, res) => {
  try {
    const { sku, name, category, price, stockQuantity, branchNumber, barcode, description } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ message: 'SKU and product name are required.' });
    }

    const cleanSku = String(sku).toUpperCase().trim();

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
      barcode: barcode || '',
      description: description || '',
      qrPayload,
      qrCodeDataUrl,
      createdByOperatorId: req.user._id,
    });

    invalidateProductCache();
    res.status(201).json(product);

    await logAudit({
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: product._id,
      entityLabel: product.sku,
      user: req.user,
      req,
      details: {
        name: product.name,
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
        branchNumber: product.branchNumber,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Could not create product with the provided data.' });
  }
};

// @desc    Update product details
// @route   PUT /api/products/:id
// @access  Private (Operator, Superadmin)
const updateProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }
    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!canManageProduct(req.user, product)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const before = {
      name: product.name,
      category: product.category,
      price: product.price,
      stockQuantity: product.stockQuantity,
      branchNumber: product.branchNumber,
      barcode: product.barcode,
      description: product.description,
    };

    product.name = req.body.name || product.name;
    product.category = req.body.category || product.category;
    product.price = req.body.price !== undefined ? req.body.price : product.price;
    product.stockQuantity =
      req.body.stockQuantity !== undefined ? req.body.stockQuantity : product.stockQuantity;
    product.branchNumber = req.body.branchNumber || product.branchNumber;
    if (req.body.barcode !== undefined) product.barcode = req.body.barcode;
    if (req.body.description !== undefined) product.description = req.body.description;

    const updatedProduct = await product.save();
    invalidateProductCache();
    res.json(updatedProduct);

    const changes = {};
    for (const field of Object.keys(before)) {
      if (updatedProduct[field] !== before[field]) {
        changes[field] = { from: before[field], to: updatedProduct[field] };
      }
    }

    if (Object.keys(changes).length > 0) {
      await logAudit({
        action: 'UPDATE_PRODUCT',
        entityType: 'Product',
        entityId: product._id,
        entityLabel: product.sku,
        user: req.user,
        req,
        details: { changes },
      });
    }

    await checkLowStock(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Unable to update product.' });
  }
};

// @desc    Adjust product stock quantity and record stock history audit log
// @route   PUT /api/products/:id/stock
// @access  Private (Operator, Superadmin)
const updateStock = async (req, res) => {
  try {
    const { quantityChanged, adjustmentType, reason } = req.body;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }

    const qty = parseInt(quantityChanged, 10);
    if (!qty || qty <= 0) {
      return res.status(400).json({ message: 'Enter a valid stock quantity.' });
    }

    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!canManageProduct(req.user, product)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const type = String(adjustmentType || 'ADDITION').toUpperCase();
    if (!['ADDITION', 'DEDUCTION', 'CORRECTION'].includes(type)) {
      return res.status(400).json({ message: 'Invalid adjustment type.' });
    }

    const previousQuantity = product.stockQuantity;

    if (type === 'DEDUCTION' && qty > previousQuantity) {
      return res.status(400).json({ message: 'Insufficient stock for this adjustment.' });
    }

    let delta;
    if (type === 'ADDITION') delta = qty;
    else if (type === 'DEDUCTION') delta = -qty;
    else delta = qty - previousQuantity;

    const newQuantity = previousQuantity + delta;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { stockQuantity: delta },
        $push: {
          stockHistory: {
            $each: [
              {
                adjustmentType: type,
                quantityChanged: Math.abs(qty),
                previousQuantity,
                newQuantity,
                reason: reason || 'Manual Inventory Adjustment',
                performedBy: userId,
                timestamp: new Date(),
              },
            ],
            $slice: -STOCK_HISTORY_LIMIT,
          },
        },
      },
      { returnDocument: 'after', runValidators: true }
    )
      .populate('createdByOperatorId', 'username roleTakerName name role')
      .populate('deletedBy', 'username roleTakerName name role')
      .populate('stockHistory.performedBy', 'username roleTakerName name role');

    invalidateProductCache();
    res.json(updatedProduct);

    await logAudit({
      action: 'UPDATE_STOCK',
      entityType: 'Product',
      entityId: product._id,
      entityLabel: product.sku,
      user: req.user,
      req,
      details: {
        adjustmentType: type,
        quantityChanged: Math.abs(qty),
        previousQuantity,
        newQuantity,
        reason: reason || 'Manual Inventory Adjustment',
      },
    });

    await checkLowStock(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Unable to update stock.' });
  }
};

// @desc    Soft-delete product with timestamp and deleter user ID
// @route   DELETE /api/products/:id
// @access  Private (Superadmin, Operator)
const deleteProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!canManageProduct(req.user, product)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = req.user._id;

    await product.save();

    invalidateProductCache();
    res.json({ message: 'Product removed successfully', product });

    await logAudit({
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: product._id,
      entityLabel: product.sku,
      user: req.user,
      req,
      details: { name: product.name, softDeleted: true },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Permanently hard-delete a product record (master override)
// @route   DELETE /api/products/:id/hard
// @access  Private (Superadmin)
const hardDeleteProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const label = product.sku;
    const snapshot = { name: product.name, price: product.price, stockQuantity: product.stockQuantity };
    await product.deleteOne();

    invalidateProductCache();
    res.json({ message: `Product ${label} permanently deleted.` });

    await logAudit({
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: req.params.id,
      entityLabel: label,
      user: req.user,
      req,
      details: { ...snapshot, hardDeleted: true },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Purge embedded stock-adjustment history (retention control)
// @route   DELETE /api/products/stock-history?confirm=PURGE[&before=ISO]
// @access  Private (Superadmin)
const purgeStockHistory = async (req, res) => {
  try {
    if (req.query.confirm !== 'PURGE') {
      return res.status(400).json({
        message: "Confirmation required. Pass ?confirm=PURGE to purge stock history.",
      });
    }

    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime())) {
      return res.status(400).json({ message: 'Invalid "before" date.' });
    }

    const historyExpr = { $ifNull: ['$stockHistory', []] };
    const matchedExpr = before
      ? {
          $size: {
            $filter: {
              input: historyExpr,
              as: 'entry',
              cond: { $lt: ['$$entry.timestamp', before] },
            },
          },
        }
      : { $size: historyExpr };

    const [stats] = await Product.aggregate([
      { $project: { matched: matchedExpr } },
      { $group: { _id: null, matched: { $sum: '$matched' } } },
    ]);
    const entriesRemoved = stats?.matched || 0;

    let productsUpdated = 0;
    if (entriesRemoved > 0) {
      const filter = before
        ? { 'stockHistory.timestamp': { $lt: before } }
        : { 'stockHistory.0': { $exists: true } };
      const update = before
        ? { $pull: { stockHistory: { timestamp: { $lt: before } } } }
        : { $set: { stockHistory: [] } };
      const result = await Product.updateMany(filter, update);
      productsUpdated = result.modifiedCount;
    }

    invalidateProductCache();

    const details = { entriesRemoved, productsUpdated, purgeScope: before ? 'before' : 'all' };
    if (before) details.before = before.toISOString();

    await logAudit({
      action: 'PURGE_STOCK_LOGS',
      entityType: 'Product',
      entityLabel: 'Stock adjustment history purge',
      user: req.user,
      req,
      details,
    });

    const scopeText = before ? `before ${before.toISOString()}` : 'in full';
    res.json({
      message: `Purged ${entriesRemoved} stock log entr${
        entriesRemoved === 1 ? 'y' : 'ies'
      } ${scopeText} across ${productsUpdated} product(s).`,
      entriesRemoved,
      productsUpdated,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getProducts,
  getCategories,
  invalidateProductCache,
  getProductByQrData,
  createProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  hardDeleteProduct,
  purgeStockHistory,
  getAuditLogs,
};
