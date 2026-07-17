require("dotenv").config();
const { connectDB } = require("../config/db");
const User = require("../modules/auth/auth.model");
const bcrypt = require("bcryptjs");

async function seedAdmin() {
  const name = process.env.ADMIN_NAME || "Admin";
  const email = (process.env.ADMIN_EMAIL || "admin@khanengineerings.com").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "admin123";

  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD must be at least 6 characters");
  }

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin already exists: ${email} (role: ${existing.role})`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "admin",
  });

  console.log("Admin seeded successfully");
  console.log(`  name:  ${user.name}`);
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${user.role}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
