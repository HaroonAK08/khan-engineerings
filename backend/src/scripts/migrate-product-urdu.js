require("dotenv").config();

const Product = require("../modules/products/product.model");
const { connectDB } = require("../config/db");

const translations = [
  {
    "name": "17/18 trolly rocket rim",
    "nameUr": "ٹرالی 17/18 راکٹ رم"
  },
  {
    "name": "18/19 super ghera",
    "nameUr": "18/19 سپر گھیرا"
  },
  {
    "name": "18/20 bm moty plate",
    "nameUr": "18/20 بی ایم موٹی پلیٹ"
  },
  {
    "name": "18/20 khulla ghera",
    "nameUr": "18/20 کھلا گھیرا"
  },
  {
    "name": "19/22 moty plate",
    "nameUr": "19/22 موٹی پلیٹ"
  },
  {
    "name": "20/22 moty plat bnd majh",
    "nameUr": "20/22 موٹی پلیٹ بند مانجھا"
  },
  {
    "name": "6 patty",
    "nameUr": "6 پٹی"
  },
  {
    "name": "6 patty a",
    "nameUr": "6 پٹی اے"
  },
  {
    "name": "China  A",
    "nameUr": "چائنا اے"
  },
  {
    "name": "China - 58kg",
    "nameUr": "چائنا - 58 کلو"
  },
  {
    "name": "China sp",
    "nameUr": "چائنا ایس پی"
  },
  {
    "name": "China tang bor",
    "nameUr": "چائنا ٹانگ بور"
  },
  {
    "name": "F D",
    "nameUr": "ایف ڈی"
  },
  {
    "name": "HUB Bedford",
    "nameUr": "ہب بیڈ فورڈ"
  },
  {
    "name": "HUB SP 210  34kg",
    "nameUr": "ہب ایس پی 210 34 کلو"
  },
  {
    "name": "HUB SP 210  36kg",
    "nameUr": "ہب ایس پی 210 36 کلو"
  },
  {
    "name": "HUB SP 210 32kg",
    "nameUr": "ہب ایس پی 210 32 کلو"
  },
  {
    "name": "Hino AK",
    "nameUr": "ہینو اے کے"
  },
  {
    "name": "Hino AK front",
    "nameUr": "ہینو اے کے فرنٹ"
  },
  {
    "name": "Hino AK rear",
    "nameUr": "ہینو اے کے ریئر"
  },
  {
    "name": "Hino Ak -F",
    "nameUr": "ہینو اے کے - ایف"
  },
  {
    "name": "Hino FF",
    "nameUr": "ہینو ایف ایف"
  },
  {
    "name": "Hino Front",
    "nameUr": "ہینو فرنٹ"
  },
  {
    "name": "Hino SG 43kg",
    "nameUr": "ہینو ایس جی 43 کلو"
  },
  {
    "name": "Hino SG a",
    "nameUr": "ہینو ایس جی اے"
  },
  {
    "name": "Hino SG front",
    "nameUr": "ہینو ایس جی فرنٹ"
  },
  {
    "name": "Hino SG/MA  sp",
    "nameUr": "ہینو ایس جی/ایم اے ایس پی"
  },
  {
    "name": "Hino SG/MA - 65kg",
    "nameUr": "ہینو ایس جی/ایم اے - 65 کلو"
  },
  {
    "name": "Hino SG/MA - sp",
    "nameUr": "ہینو ایس جی/ایم اے - ایس پی"
  },
  {
    "name": "Hino-FF (F)",
    "nameUr": "ہینو-ایف ایف (ایف)"
  },
  {
    "name": "Hino-FF (R)",
    "nameUr": "ہینو-ایف ایف (آر)"
  },
  {
    "name": "Hub FD 22kg",
    "nameUr": "ہب ایف ڈی 22 کلو"
  },
  {
    "name": "ISUZU MT",
    "nameUr": "ایسوزو ایم ٹی"
  },
  {
    "name": "ISUZU MT moty plate",
    "nameUr": "ایسوزو ایم ٹی موٹی پلیٹ"
  },
  {
    "name": "ISUZU MT rear 52kg",
    "nameUr": "ایسوزو ایم ٹی ریئر 52 کلو"
  },
  {
    "name": "ISUZU-MT (F) -",
    "nameUr": "ایسوزو-ایم ٹی (ایف)"
  },
  {
    "name": "ISUZU-MT (R) - 42kg",
    "nameUr": "ایسوزو-ایم ٹی (آر) - 42 کلو"
  },
  {
    "name": "KB 33kg",
    "nameUr": "کے بی 33 کلو"
  },
  {
    "name": "Nissan 32",
    "nameUr": "نسان 32"
  },
  {
    "name": "Nissan 35 bnd mj",
    "nameUr": "نسان 35 بند مانجھا"
  },
  {
    "name": "Nissan 35kg",
    "nameUr": "نسان 35 کلو"
  },
  {
    "name": "Nissan 38kg",
    "nameUr": "نسان 38 کلو"
  },
  {
    "name": "Nissan A",
    "nameUr": "نسان اے"
  },
  {
    "name": "Nissan Band Majha  38kg",
    "nameUr": "نسان بند مانجھا 38 کلو"
  },
  {
    "name": "Nissan Front",
    "nameUr": "نسان فرنٹ"
  },
  {
    "name": "Nissan Moty Pl  Band Majha",
    "nameUr": "نسان موٹی پلیٹ بند مانجھا"
  },
  {
    "name": "Nissan Moty Plate",
    "nameUr": "نسان موٹی پلیٹ"
  },
  {
    "name": "Nissan Moty Plate 35 kg",
    "nameUr": "نسان موٹی پلیٹ 35 کلو"
  },
  {
    "name": "Nissan TK20 - 55kg",
    "nameUr": "نسان ٹی کے 20 - 55 کلو"
  },
  {
    "name": "Nissan TK20 - 60kg",
    "nameUr": "نسان ٹی کے 20 - 60 کلو"
  },
  {
    "name": "Nissan TK20 - patty",
    "nameUr": "نسان ٹی کے 20 - پٹی"
  },
  {
    "name": "Nissan TK20 A",
    "nameUr": "نسان ٹی کے 20 اے"
  },
  {
    "name": "Nissan TK20 regular",
    "nameUr": "نسان ٹی کے 20 ریگولر"
  },
  {
    "name": "Nissan TK20 sp",
    "nameUr": "نسان ٹی کے 20 ایس پی"
  },
  {
    "name": "Nissan gol",
    "nameUr": "نسان گول"
  },
  {
    "name": "Nissan gol 36",
    "nameUr": "نسان گول 36"
  },
  {
    "name": "Rocket F 23kg",
    "nameUr": "راکٹ ایف 23 کلو"
  },
  {
    "name": "S G  plan plate",
    "nameUr": "ایس جی پلین پلیٹ"
  },
  {
    "name": "SG (A)  29kg",
    "nameUr": "ایس جی (اے) 29 کلو"
  },
  {
    "name": "SG Band Majha",
    "nameUr": "ایس جی بند مانجھا"
  },
  {
    "name": "SG Moty Plat  Band  majha",
    "nameUr": "ایس جی موٹی پلیٹ بند مانجھا"
  },
  {
    "name": "SG Moty Plate",
    "nameUr": "ایس جی موٹی پلیٹ"
  },
  {
    "name": "SP 210  A",
    "nameUr": "ایس پی 210 اے"
  },
  {
    "name": "SP 210 (F)",
    "nameUr": "ایس پی 210 (ایف)"
  },
  {
    "name": "SP 210 (R)",
    "nameUr": "ایس پی 210 (آر)"
  },
  {
    "name": "SP 210 (R) - 55kg",
    "nameUr": "ایس پی 210 (آر) - 55 کلو"
  },
  {
    "name": "SP 210 (R) - 65kg",
    "nameUr": "ایس پی 210 (آر) - 65 کلو"
  },
  {
    "name": "SP 210 (R) sp",
    "nameUr": "ایس پی 210 (آر) ایس پی"
  },
  {
    "name": "SP 210 sp",
    "nameUr": "ایس پی 210 ایس پی"
  },
  {
    "name": "Sg  32kg",
    "nameUr": "ایس جی 32 کلو"
  },
  {
    "name": "TDJ Goal",
    "nameUr": "ٹی ڈی جے گول"
  },
  {
    "name": "Tatra",
    "nameUr": "ٹاٹرا"
  },
  {
    "name": "Tatra  A",
    "nameUr": "ٹاٹرا اے"
  },
  {
    "name": "Tatra - 52kg",
    "nameUr": "ٹاٹرا - 52 کلو"
  },
  {
    "name": "Tatra - 65kg",
    "nameUr": "ٹاٹرا - 65 کلو"
  },
  {
    "name": "Tatra 36kg",
    "nameUr": "ٹاٹرا 36 کلو"
  },
  {
    "name": "Tatra 42kg",
    "nameUr": "ٹاٹرا 42 کلو"
  },
  {
    "name": "Tatra 48kg",
    "nameUr": "ٹاٹرا 48 کلو"
  },
  {
    "name": "Tatra 52kg",
    "nameUr": "ٹاٹرا 52 کلو"
  },
  {
    "name": "Tatra 55kg",
    "nameUr": "ٹاٹرا 55 کلو"
  },
  {
    "name": "Tatra 58kg",
    "nameUr": "ٹاٹرا 58 کلو"
  },
  {
    "name": "Tatra 60kg",
    "nameUr": "ٹاٹرا 60 کلو"
  },
  {
    "name": "Tatra A  34kg",
    "nameUr": "ٹاٹرا اے 34 کلو"
  },
  {
    "name": "Tatra Goal - 32kg",
    "nameUr": "ٹاٹرا گول - 32 کلو"
  },
  {
    "name": "Tatra Goal - 35kg",
    "nameUr": "ٹاٹرا گول - 35 کلو"
  },
  {
    "name": "Tatra Goal A - 33kg",
    "nameUr": "ٹاٹرا گول اے - 33 کلو"
  },
  {
    "name": "Tatra SP",
    "nameUr": "ٹاٹرا ایس پی"
  },
  {
    "name": "Tatra SP",
    "nameUr": "ٹاٹرا ایس پی"
  },
  {
    "name": "Tatra china 46kg",
    "nameUr": "ٹاٹرا چائنا 46 کلو"
  },
  {
    "name": "Tatra gol bnd mj mp",
    "nameUr": "ٹاٹرا گول بند مانجھا موٹی پلیٹ"
  },
  {
    "name": "Trolly 15/17 - 27kg",
    "nameUr": "ٹرالی 15/17 - 27 کلو"
  },
  {
    "name": "Trolly 17/18 - 27kg",
    "nameUr": "ٹرالی 17/18 - 27 کلو"
  },
  {
    "name": "Trolly 17/18 m/p - 32kg",
    "nameUr": "ٹرالی 17/18 موٹی پلیٹ - 32 کلو"
  },
  {
    "name": "Trolly 18/20 - 32kg",
    "nameUr": "ٹرالی 18/20 - 32 کلو"
  },
  {
    "name": "Trolly 18/20 m/p - 36kg",
    "nameUr": "ٹرالی 18/20 موٹی پلیٹ - 36 کلو"
  },
  {
    "name": "Trolly 18/21 - 55kg",
    "nameUr": "ٹرالی 18/21 - 55 کلو"
  },
  {
    "name": "Trolly 20/22 - 55kg",
    "nameUr": "ٹرالی 20/22 - 55 کلو"
  },
  {
    "name": "Turbo",
    "nameUr": "ٹربو"
  },
  {
    "name": "akbar choty",
    "nameUr": "اکبر چھوٹی"
  },
  {
    "name": "bedford",
    "nameUr": "بیڈ فورڈ"
  },
  {
    "name": "bedford a",
    "nameUr": "بیڈ فورڈ اے"
  },
  {
    "name": "china 7",
    "nameUr": "چائنا 7"
  },
  {
    "name": "cp 87 f",
    "nameUr": "سی پی 87 ایف"
  },
  {
    "name": "cp/87 f",
    "nameUr": "سی پی/87 ایف"
  },
  {
    "name": "cpb/12",
    "nameUr": "سی پی بی/12"
  },
  {
    "name": "daewoo",
    "nameUr": "ڈیوو"
  },
  {
    "name": "daewoo",
    "nameUr": "ڈیوو"
  },
  {
    "name": "drum muramat",
    "nameUr": "ڈرم مرمت"
  },
  {
    "name": "dutro",
    "nameUr": "ڈیوٹرو"
  },
  {
    "name": "faw front",
    "nameUr": "ایف اے ڈبلیو فرنٹ"
  },
  {
    "name": "fiat",
    "nameUr": "فیات"
  },
  {
    "name": "fuwa 60",
    "nameUr": "فوا 60"
  },
  {
    "name": "hub China Fuwa",
    "nameUr": "ہب چائنا فوا"
  },
  {
    "name": "hub China Fuwa Goal",
    "nameUr": "ہب چائنا فوا گول"
  },
  {
    "name": "huwo",
    "nameUr": "ہووو"
  },
  {
    "name": "isuzu front",
    "nameUr": "ایسوزو فرنٹ"
  },
  {
    "name": "isuzu jcr",
    "nameUr": "ایسوزو جے سی آر"
  },
  {
    "name": "leland",
    "nameUr": "لیلینڈ"
  },
  {
    "name": "mercedese",
    "nameUr": "مرسڈیز"
  },
  {
    "name": "nissan 32 bm",
    "nameUr": "نسان 32 بی ایم"
  },
  {
    "name": "nissan Fr - 27kg",
    "nameUr": "نسان ایف آر - 27 کلو"
  },
  {
    "name": "nissan fr a",
    "nameUr": "نسان ایف آر اے"
  },
  {
    "name": "nissan gol trolly mp",
    "nameUr": "نسان گول ٹرالی موٹی پلیٹ"
  },
  {
    "name": "nissan trolly moty p band m",
    "nameUr": "نسان ٹرالی موٹی پلیٹ بند مانجھا"
  },
  {
    "name": "npr",
    "nameUr": "این پی آر"
  },
  {
    "name": "sany",
    "nameUr": "سانی"
  },
  {
    "name": "sg b",
    "nameUr": "ایس جی بی"
  },
  {
    "name": "sg fr",
    "nameUr": "ایس جی ایف آر"
  },
  {
    "name": "sp 210 bm plane",
    "nameUr": "ایس پی 210 بی ایم پلین"
  },
  {
    "name": "super",
    "nameUr": "سپر"
  },
  {
    "name": "super bedford",
    "nameUr": "سپر بیڈ فورڈ"
  },
  {
    "name": "trolly 12/15",
    "nameUr": "ٹرالی 12/15"
  },
  {
    "name": "trolly 13/16",
    "nameUr": "ٹرالی 13/16"
  },
  {
    "name": "trolly 17/18 khulla bore",
    "nameUr": "ٹرالی 17/18 کھلا بور"
  },
  {
    "name": "trolly 17/18 m/p",
    "nameUr": "ٹرالی 17/18 موٹی پلیٹ"
  },
  {
    "name": "trolly 17/19",
    "nameUr": "ٹرالی 17/19"
  },
  {
    "name": "trolly goal nissan",
    "nameUr": "ٹرالی گول نسان"
  },
  {
    "name": "trolly murammat",
    "nameUr": "ٹرالی مرمت"
  },
  {
    "name": "turbo sp",
    "nameUr": "ٹربو ایس پی"
  },
  {
    "name": "turbo sp",
    "nameUr": "ٹربو ایس پی"
  },
  {
    "name": "volvo",
    "nameUr": "وولوو"
  }
];

async function run() {
  await connectDB();
  const operations = translations.map(({ name, nameUr }) => ({
    updateOne: { filter: { name }, update: { $set: { nameUr } } },
  }));
  const result = await Product.bulkWrite(operations, { ordered: false });
  console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount, translations: translations.length }));
}

run().then(() => process.exit(0)).catch((error) => {
  console.error("Product Urdu migration failed:", error);
  process.exit(1);
});
