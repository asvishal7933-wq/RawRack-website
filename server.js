require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const Razorpay = require("razorpay");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "orders.json");
const UPLOADS = path.join(ROOT, "uploads");

fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, "[]");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(ROOT, "public")));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG, JPG and WEBP design files are allowed."), ok);
  }
});

const products = {
  hoodie: { id:"hoodie", name:"Custom Hoodie", price:1999, category:"HOODIES", image:"/assets/diet-coke-hoodie.jpg", description:"Heavyweight custom hoodie built for graphic pieces and personal designs." },
  tshirt: { id:"tshirt", name:"Custom T-Shirt", price:1699, category:"T-SHIRTS", image:"/assets/rawrack-logo.png", description:"Premium custom tee with room for your artwork and graphics." },
  pants: { id:"pants", name:"Custom Pants", price:1499, category:"PANTS", image:"/assets/rawrack-logo.png", description:"Custom pants designed for a raw, oversized streetwear silhouette." },
  badge: { id:"badge", name:"Raw Badge", price:399, category:"BADGES", image:"/assets/rawrack-logo.png", description:"Collectible RawRack badge. Final price varies by badge design." }
};

function readOrders() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { return []; }
}
function writeOrders(orders) {
  fs.writeFileSync(DATA, JSON.stringify(orders, null, 2));
}
function orderNumber() {
  return "RR" + Date.now().toString().slice(-8);
}
function razor() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

app.get("/api/products", (_, res) => res.json(Object.values(products)));

app.post("/api/upload-design", upload.single("design"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No design file uploaded." });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname });
});

app.post("/api/orders", async (req, res) => {
  const { items, customer, customization } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Cart is empty." });
  if (!customer?.name || !customer?.phone || !customer?.address || !customer?.pincode) {
    return res.status(400).json({ error: "Name, phone, address and Bangalore pincode are required." });
  }

  const cleanItems = items.map(x => {
    const p = products[x.productId];
    if (!p) throw new Error("Invalid product.");
    return {
      productId: p.id, name: p.name, size: x.size || "M", color: x.color || "Concrete Grey",
      quantity: Math.max(1, Number(x.quantity || 1)), price: p.price,
      designUrl: x.designUrl || "", designName: x.designName || "",
      note: x.note || ""
    };
  });
  const amount = cleanItems.reduce((sum, x) => sum + x.price * x.quantity, 0);

  const order = {
    orderNumber: orderNumber(),
    createdAt: new Date().toISOString(),
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    amount,
    items: cleanItems,
    customer: {
      name: customer.name, phone: customer.phone, email: customer.email || "",
      address: customer.address, pincode: customer.pincode
    },
    customization: customization || {}
  };

  const rzp = razor();
  if (rzp) {
    const rOrder = await rzp.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: order.orderNumber,
      notes: { rawrack_order: order.orderNumber },
      payment_capture: 1
    });
    order.razorpayOrderId = rOrder.id;
  } else {
    order.razorpayOrderId = "demo_" + order.orderNumber;
  }

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);

  res.json({
    orderNumber: order.orderNumber,
    amount,
    razorpayOrderId: order.razorpayOrderId,
    keyId: process.env.RAZORPAY_KEY_ID || "",
    demoMode: !rzp
  });
});

app.post("/api/payment/verify", (req, res) => {
  const { orderNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const orders = readOrders();
  const order = orders.find(o => o.orderNumber === orderNumber);
  if (!order) return res.status(404).json({ error: "Order not found." });

  if (!process.env.RAZORPAY_KEY_SECRET) {
    order.status = "PAID";
    order.paymentStatus = "DEMO_PAID";
    order.razorpayPaymentId = razorpay_payment_id || "demo_payment";
    writeOrders(orders);
    return res.json({ ok: true, orderNumber });
  }

  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature || razorpay_order_id !== order.razorpayOrderId) {
    return res.status(400).json({ error: "Payment signature verification failed." });
  }

  order.status = "PAID";
  order.paymentStatus = "VERIFIED";
  order.razorpayPaymentId = razorpay_payment_id;
  order.paidAt = new Date().toISOString();
  writeOrders(orders);
  res.json({ ok: true, orderNumber });
});

app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).send("Webhook secret not configured.");
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  if (signature !== expected) return res.status(400).send("Invalid signature");

  const event = JSON.parse(req.body.toString("utf8"));
  const payment = event?.payload?.payment?.entity;
  if (payment?.order_id) {
    const orders = readOrders();
    const order = orders.find(o => o.razorpayOrderId === payment.order_id);
    if (order) {
      if (event.event === "payment.captured") {
        order.status = "PAID";
        order.paymentStatus = "CAPTURED";
        order.razorpayPaymentId = payment.id;
        order.paidAt = new Date().toISOString();
        writeOrders(orders);
      }
    }
  }
  res.json({ received: true });
});

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}
app.get("/api/admin/orders", adminAuth, (_, res) => res.json(readOrders()));

app.post("/api/admin/orders/:orderNumber/status", adminAuth, (req, res) => {
  const allowed = ["PAID","PROCESSING","CUSTOMIZATION","READY","SHIPPED","DELIVERED","CANCELLED"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
  const orders = readOrders();
  const order = orders.find(o => o.orderNumber === req.params.orderNumber);
  if (!order) return res.status(404).json({ error: "Order not found." });
  order.status = req.body.status;
  order.updatedAt = new Date().toISOString();
  writeOrders(orders);
  res.json({ ok:true, order });
});

app.get("/api/orders/:orderNumber", (req, res) => {
  const order = readOrders().find(o => o.orderNumber === req.params.orderNumber);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json(order);
});

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || "Request failed." });
  next();
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`RawRack running at http://localhost:${PORT}`));
}
module.exports = app;
