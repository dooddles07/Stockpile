/**
 * Source vocabulary for the seeded dataset.
 *
 * Brands, suppliers and customers are invented. Real company names are
 * deliberately avoided: the fixtures attach performance metrics (defect rate,
 * on-time delivery) to each supplier, and hanging invented numbers on a real
 * business would be fabricating a record about them.
 */

export const CATEGORY_SEEDS = [
  {
    slug: "barcode-labelling",
    name: "Barcode & Labelling",
    prefix: "BCL",
    description:
      "Scanners, label printers, ribbons and media used for SKU identification.",
  },
  {
    slug: "material-handling",
    name: "Material Handling",
    prefix: "MHE",
    description:
      "Pallet jacks, carts, hand trucks and lifting equipment for warehouse floors.",
  },
  {
    slug: "safety-ppe",
    name: "Safety & PPE",
    prefix: "PPE",
    description: "Personal protective equipment and site safety consumables.",
  },
  {
    slug: "packaging-shipping",
    name: "Packaging & Shipping",
    prefix: "PKG",
    description: "Cartons, void fill, stretch wrap, tape and shipping supplies.",
  },
  {
    slug: "storage-shelving",
    name: "Storage & Shelving",
    prefix: "STG",
    description: "Racking, bins, totes and modular storage systems.",
  },
  {
    slug: "computing-peripherals",
    name: "Computing & Peripherals",
    prefix: "CMP",
    description: "Terminals, docks, mobile computers and workstation hardware.",
  },
  {
    slug: "power-electrical",
    name: "Power & Electrical",
    prefix: "PWR",
    description: "UPS units, batteries, charging banks and electrical fittings.",
  },
  {
    slug: "facility-janitorial",
    name: "Facility & Janitorial",
    prefix: "FAC",
    description: "Cleaning chemicals, floor care and facility maintenance stock.",
  },
  {
    slug: "consumables-paper",
    name: "Consumables & Paper",
    prefix: "CNS",
    description: "Thermal paper, forms, toner and general office consumables.",
  },
] as const;

export type CategorySlug = (typeof CATEGORY_SEEDS)[number]["slug"];

interface ProductSeed {
  base: string;
  code: string;
  unit: string;
  cost: [number, number];
  margin: [number, number];
  variants: string[];
  batch?: boolean;
  serial?: boolean;
  expiry?: number;
}

export const PRODUCT_SEEDS: Record<CategorySlug, ProductSeed[]> = {
  "barcode-labelling": [
    { base: "Wireless Barcode Scanner", code: "SCN", unit: "unit", cost: [128, 320], margin: [0.28, 0.44], variants: ["1D Corded", "2D Corded", "2D Bluetooth", "Rugged 2D", "Presentation"], serial: true },
    { base: "Industrial Label Printer", code: "LPR", unit: "unit", cost: [420, 1650], margin: [0.22, 0.36], variants: ["203 dpi", "300 dpi", "600 dpi", "Wide Web"], serial: true },
    { base: "Desktop Label Printer", code: "DLP", unit: "unit", cost: [180, 460], margin: [0.26, 0.4], variants: ["203 dpi", "300 dpi", "Ethernet"], serial: true },
    { base: "Thermal Transfer Ribbon", code: "RBN", unit: "roll", cost: [6.4, 21], margin: [0.32, 0.5], variants: ["Wax 110mm", "Wax-Resin 110mm", "Resin 110mm", "Wax 60mm", "Resin 84mm"], batch: true },
    { base: "Direct Thermal Label Roll", code: "LBL", unit: "roll", cost: [3.2, 14], margin: [0.34, 0.54], variants: ["50×25mm", "100×50mm", "100×150mm", "76×51mm", "38×19mm"], batch: true },
    { base: "Handheld RFID Reader", code: "RFD", unit: "unit", cost: [640, 1900], margin: [0.2, 0.32], variants: ["UHF Short Range", "UHF Long Range", "Sled Attachment"], serial: true },
    { base: "Barcode Scanner Stand", code: "SST", unit: "unit", cost: [14, 46], margin: [0.4, 0.58], variants: ["Gooseneck", "Weighted Base", "Wall Mount"] },
    { base: "Label Applicator", code: "APL", unit: "unit", cost: [210, 780], margin: [0.24, 0.38], variants: ["Manual", "Semi-Automatic", "Tamp-Blow"] },
  ],
  "material-handling": [
    { base: "Manual Pallet Jack", code: "PJK", unit: "unit", cost: [280, 690], margin: [0.24, 0.38], variants: ["2500kg", "3000kg", "Galvanised", "Narrow Fork"], serial: true },
    { base: "Electric Pallet Truck", code: "EPT", unit: "unit", cost: [2400, 5800], margin: [0.16, 0.26], variants: ["1500kg", "2000kg", "Ride-On"], serial: true },
    { base: "Platform Trolley", code: "TRL", unit: "unit", cost: [96, 340], margin: [0.3, 0.46], variants: ["Small", "Medium", "Large", "Folding", "Two-Tier"] },
    { base: "Sack Truck", code: "SKT", unit: "unit", cost: [48, 168], margin: [0.32, 0.5], variants: ["Standard", "Stair Climber", "Convertible", "Puncture-Proof"] },
    { base: "Steel Pallet", code: "PLT", unit: "unit", cost: [34, 118], margin: [0.22, 0.36], variants: ["1200×800", "1200×1000", "Euro", "Half"] },
    { base: "Warehouse Ladder", code: "LDR", unit: "unit", cost: [140, 620], margin: [0.26, 0.4], variants: ["3-Step", "5-Step", "8-Step", "Mobile Platform"] },
    { base: "Load Restraint Strap", code: "STR", unit: "pack", cost: [11, 42], margin: [0.36, 0.54], variants: ["25mm 4m", "50mm 6m", "50mm 9m", "Ratchet Kit"] },
    { base: "Conveyor Roller Section", code: "CNV", unit: "unit", cost: [180, 540], margin: [0.2, 0.34], variants: ["1.5m Gravity", "3m Gravity", "Skate Wheel"] },
  ],
  "safety-ppe": [
    { base: "Nitrile Safety Gloves", code: "GLV", unit: "box", cost: [5.8, 18], margin: [0.36, 0.56], variants: ["Small", "Medium", "Large", "X-Large", "Powder-Free L"], batch: true, expiry: 900 },
    { base: "Cut-Resistant Gloves", code: "GCR", unit: "pair", cost: [4.2, 16], margin: [0.38, 0.58], variants: ["Level A3 M", "Level A3 L", "Level A5 L", "Level A5 XL"] },
    { base: "Safety Goggles", code: "GOG", unit: "unit", cost: [3.1, 14], margin: [0.4, 0.6], variants: ["Clear Anti-Fog", "Tinted", "Over-Glasses", "Sealed"] },
    { base: "High-Visibility Vest", code: "HVV", unit: "unit", cost: [4.6, 19], margin: [0.4, 0.62], variants: ["Class 2 M", "Class 2 L", "Class 3 L", "Class 3 XL", "Winter Lined"] },
    { base: "Steel-Toe Work Boot", code: "BOT", unit: "pair", cost: [42, 128], margin: [0.3, 0.46], variants: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"] },
    { base: "Respirator Mask", code: "RSP", unit: "box", cost: [12, 48], margin: [0.34, 0.52], variants: ["FFP2", "FFP3", "Valved FFP3", "Half-Face"], batch: true, expiry: 1460 },
    { base: "First Aid Station", code: "FAS", unit: "unit", cost: [58, 240], margin: [0.3, 0.48], variants: ["10-Person", "25-Person", "50-Person", "Burns Kit"], expiry: 730 },
    { base: "Ear Defenders", code: "EAR", unit: "unit", cost: [8, 34], margin: [0.36, 0.54], variants: ["SNR 27", "SNR 31", "Helmet Mount", "Electronic"] },
    { base: "Safety Helmet", code: "HLM", unit: "unit", cost: [9, 44], margin: [0.34, 0.52], variants: ["Vented", "Non-Vented", "Chin Strap", "Visor Kit"], expiry: 1825 },
  ],
  "packaging-shipping": [
    { base: "Single Wall Carton", code: "CTN", unit: "bundle", cost: [12, 58], margin: [0.3, 0.48], variants: ["203×203×203", "305×229×229", "381×305×305", "457×457×457", "Mailer"] },
    { base: "Double Wall Carton", code: "CTD", unit: "bundle", cost: [24, 96], margin: [0.28, 0.44], variants: ["305×305×305", "457×305×305", "610×457×457", "Export Grade"] },
    { base: "Pallet Stretch Wrap", code: "WRP", unit: "roll", cost: [4.8, 22], margin: [0.34, 0.52], variants: ["Hand 400mm", "Machine 500mm", "Pre-Stretch", "Black Opaque", "Vented"] },
    { base: "Packing Tape", code: "TPE", unit: "pack", cost: [6.2, 26], margin: [0.36, 0.56], variants: ["Clear 48mm", "Brown 48mm", "Printed Fragile", "Reinforced", "Low Noise"] },
    { base: "Bubble Wrap Roll", code: "BUB", unit: "roll", cost: [9.4, 44], margin: [0.34, 0.52], variants: ["Small Bubble 500mm", "Large Bubble 750mm", "Anti-Static", "Perforated"] },
    { base: "Void Fill Paper", code: "VDF", unit: "box", cost: [18, 62], margin: [0.32, 0.5], variants: ["Kraft 380mm", "Honeycomb", "Recycled 500mm"] },
    { base: "Poly Mailer Bag", code: "PMB", unit: "pack", cost: [8, 38], margin: [0.38, 0.58], variants: ["250×350", "350×450", "450×550", "Padded", "Recycled"] },
    { base: "Shipping Label Pouch", code: "PCH", unit: "pack", cost: [7, 28], margin: [0.4, 0.6], variants: ["A5 Documents Enclosed", "A6", "A7"] },
    { base: "Strapping Kit", code: "SPK", unit: "kit", cost: [42, 165], margin: [0.28, 0.44], variants: ["PP 12mm", "PET 16mm", "Tensioner Set"] },
  ],
  "storage-shelving": [
    { base: "Stackable Storage Bin", code: "BIN", unit: "unit", cost: [2.4, 16], margin: [0.4, 0.62], variants: ["Size 1 Blue", "Size 2 Blue", "Size 3 Red", "Size 4 Yellow", "Size 5 Grey"] },
    { base: "Attached Lid Container", code: "ALC", unit: "unit", cost: [9.8, 34], margin: [0.34, 0.52], variants: ["32L", "45L", "64L", "80L"] },
    { base: "Boltless Shelving Bay", code: "SHV", unit: "bay", cost: [86, 320], margin: [0.28, 0.44], variants: ["1800×900×450", "2000×1200×600", "2400×1200×600", "Add-On Bay"] },
    { base: "Pallet Racking Beam", code: "RCK", unit: "unit", cost: [28, 96], margin: [0.26, 0.4], variants: ["2700mm", "3300mm", "3900mm", "Heavy Duty"] },
    { base: "Small Parts Cabinet", code: "CAB", unit: "unit", cost: [64, 260], margin: [0.3, 0.46], variants: ["24 Drawer", "39 Drawer", "60 Drawer", "Wall Mount"] },
    { base: "Mobile Tote Rack", code: "TRK", unit: "unit", cost: [120, 420], margin: [0.28, 0.44], variants: ["3-Tier", "4-Tier", "Braked"] },
    { base: "Louvre Panel Kit", code: "LVR", unit: "kit", cost: [38, 140], margin: [0.32, 0.5], variants: ["Wall 900mm", "Wall 1200mm", "Free-Standing"] },
  ],
  "computing-peripherals": [
    { base: "USB-C Docking Station", code: "DCK", unit: "unit", cost: [78, 240], margin: [0.24, 0.38], variants: ["Dual 4K", "Triple Display", "Thunderbolt", "Power Delivery 100W"], serial: true },
    { base: "Rugged Mobile Computer", code: "RMC", unit: "unit", cost: [720, 2400], margin: [0.18, 0.3], variants: ["Pistol Grip", "Touch 5in", "Touch 6in", "Freezer Grade"], serial: true },
    { base: "Warehouse Tablet", code: "TAB", unit: "unit", cost: [340, 980], margin: [0.2, 0.32], variants: ["8in Wi-Fi", "10in Wi-Fi", "10in LTE", "Vehicle Mount"], serial: true },
    { base: "Industrial Monitor", code: "MON", unit: "unit", cost: [190, 720], margin: [0.22, 0.34], variants: ["22in", "24in", "27in Touch", "32in Sunlight"], serial: true },
    { base: "Wireless Keyboard & Mouse", code: "KBM", unit: "set", cost: [22, 88], margin: [0.3, 0.48], variants: ["Compact", "Full Size", "Washable", "Ergonomic"] },
    { base: "Network Switch", code: "NSW", unit: "unit", cost: [96, 620], margin: [0.22, 0.36], variants: ["8-Port PoE", "16-Port", "24-Port Managed", "48-Port Managed"], serial: true },
    { base: "Wi-Fi 6 Access Point", code: "WAP", unit: "unit", cost: [140, 520], margin: [0.22, 0.34], variants: ["Indoor", "Outdoor", "Warehouse High-Gain"], serial: true },
  ],
  "power-electrical": [
    { base: "Rack Mount UPS", code: "UPS", unit: "unit", cost: [280, 1800], margin: [0.18, 0.3], variants: ["1000VA", "1500VA", "2200VA", "3000VA"], serial: true },
    { base: "Multi-Bay Battery Charger", code: "CHG", unit: "unit", cost: [110, 480], margin: [0.24, 0.38], variants: ["4-Bay", "8-Bay", "Vehicle", "Cradle Kit"], serial: true },
    { base: "Rechargeable Battery Pack", code: "BAT", unit: "unit", cost: [22, 96], margin: [0.3, 0.48], variants: ["Standard", "Extended", "Cold Chain", "Spare Kit"], batch: true, expiry: 1095 },
    { base: "Industrial Extension Reel", code: "EXT", unit: "unit", cost: [24, 110], margin: [0.3, 0.48], variants: ["10m 16A", "25m 16A", "25m 32A", "4-Way"] },
    { base: "LED High Bay Light", code: "LED", unit: "unit", cost: [42, 190], margin: [0.28, 0.44], variants: ["100W", "150W", "200W", "Motion Sensing"] },
    { base: "Surge Protected Power Strip", code: "PWS", unit: "unit", cost: [12, 62], margin: [0.34, 0.52], variants: ["6-Way", "8-Way", "Rack 1U", "Metered"] },
  ],
  "facility-janitorial": [
    { base: "Industrial Floor Cleaner", code: "CLN", unit: "drum", cost: [24, 92], margin: [0.32, 0.5], variants: ["5L Concentrate", "20L Concentrate", "Degreaser 5L", "Neutral pH 20L"], batch: true, expiry: 730 },
    { base: "Surface Disinfectant", code: "DSF", unit: "case", cost: [18, 68], margin: [0.34, 0.52], variants: ["750ml ×12", "5L ×2", "Wipes ×6"], batch: true, expiry: 545 },
    { base: "Microfibre Cloth Pack", code: "MFC", unit: "pack", cost: [5.2, 22], margin: [0.4, 0.6], variants: ["Blue ×10", "Red ×10", "Green ×10", "Yellow ×10"] },
    { base: "Mop & Bucket System", code: "MOP", unit: "set", cost: [28, 120], margin: [0.32, 0.5], variants: ["Single", "Twin", "Microfibre Flat", "Compact"] },
    { base: "Waste Bin", code: "WST", unit: "unit", cost: [16, 96], margin: [0.34, 0.52], variants: ["60L Pedal", "90L Open", "120L Wheelie", "Recycling Trio"] },
    { base: "Absorbent Spill Kit", code: "SPL", unit: "kit", cost: [42, 180], margin: [0.3, 0.48], variants: ["Oil 50L", "Chemical 50L", "General 100L", "Wheeled 240L"], expiry: 1825 },
    { base: "Hand Sanitiser Station", code: "SAN", unit: "unit", cost: [34, 140], margin: [0.32, 0.5], variants: ["Free-Standing", "Wall Mount", "Automatic"], batch: true, expiry: 730 },
  ],
  "consumables-paper": [
    { base: "Thermal Receipt Paper", code: "TRP", unit: "box", cost: [14, 52], margin: [0.34, 0.54], variants: ["57×40mm ×20", "80×80mm ×20", "80×80mm ×50", "BPA-Free ×20"], batch: true },
    { base: "Multipurpose Copy Paper", code: "CPY", unit: "box", cost: [21, 46], margin: [0.26, 0.4], variants: ["A4 80gsm", "A4 100gsm", "A3 80gsm", "Recycled A4"] },
    { base: "Laser Toner Cartridge", code: "TNR", unit: "unit", cost: [38, 190], margin: [0.24, 0.4], variants: ["Black Standard", "Black High Yield", "Cyan", "Magenta", "Yellow"], batch: true, expiry: 1095 },
    { base: "Picking List Form", code: "FRM", unit: "box", cost: [16, 54], margin: [0.32, 0.5], variants: ["2-Part ×1000", "3-Part ×1000", "Continuous ×2000"] },
    { base: "Permanent Marker", code: "MKR", unit: "pack", cost: [4.2, 18], margin: [0.4, 0.6], variants: ["Black ×12", "Assorted ×12", "Chisel ×10", "Industrial ×6"], expiry: 1460 },
    { base: "Document Wallet", code: "DWL", unit: "pack", cost: [6.4, 24], margin: [0.36, 0.56], variants: ["A4 ×50", "A5 ×50", "Foolscap ×25"] },
  ],
};

export const BRANDS = [
  "Kestrel",
  "Northline",
  "Ironclad",
  "Meridian",
  "Vantage Pro",
  "Halcyon",
  "Ridgeway",
  "Corvus",
  "Palisade",
  "Orbis",
  "Truweld",
  "Lumen Works",
  "Silverline",
  "Fairmont",
  "Stanwick",
] as const;

export const SUPPLIER_SEEDS = [
  { name: "Northline Industrial Supply", city: "Columbus", country: "United States", cats: ["material-handling", "storage-shelving"] },
  { name: "Meridian Packaging Group", city: "Memphis", country: "United States", cats: ["packaging-shipping"] },
  { name: "Corvus Technologies BV", city: "Eindhoven", country: "Netherlands", cats: ["computing-peripherals", "barcode-labelling"] },
  { name: "Baxter Safety Products", city: "Sheffield", country: "United Kingdom", cats: ["safety-ppe"] },
  { name: "Ridgeway Materials Handling", city: "Dortmund", country: "Germany", cats: ["material-handling"] },
  { name: "Halcyon Tool Works", city: "Osaka", country: "Japan", cats: ["material-handling", "power-electrical"] },
  { name: "Palisade Paper & Print", city: "Green Bay", country: "United States", cats: ["consumables-paper"] },
  { name: "Orbis Electronics Ltd", city: "Shenzhen", country: "China", cats: ["computing-peripherals", "power-electrical"] },
  { name: "Truweld Fabrication", city: "Hamilton", country: "Canada", cats: ["storage-shelving"] },
  { name: "Vantage Logistics Supply", city: "Rotterdam", country: "Netherlands", cats: ["packaging-shipping", "material-handling"] },
  { name: "Fairmont Facility Services", city: "Lyon", country: "France", cats: ["facility-janitorial"] },
  { name: "Kestrel Labels & Media", city: "Leeds", country: "United Kingdom", cats: ["barcode-labelling", "consumables-paper"] },
  { name: "Ansgar Chemicals GmbH", city: "Leverkusen", country: "Germany", cats: ["facility-janitorial"] },
  { name: "Lumen Power Systems", city: "Taipei", country: "Taiwan", cats: ["power-electrical"] },
  { name: "Silverline Storage Systems", city: "Brescia", country: "Italy", cats: ["storage-shelving"] },
  { name: "Cobalt Components Inc", city: "Austin", country: "United States", cats: ["computing-peripherals"] },
  { name: "Dunmore Textiles", city: "Coimbatore", country: "India", cats: ["safety-ppe"] },
  { name: "Applegate Distribution", city: "Wakefield", country: "United Kingdom", cats: ["consumables-paper", "facility-janitorial"] },
  { name: "Harborview Import Co", city: "Long Beach", country: "United States", cats: ["packaging-shipping", "storage-shelving"] },
  { name: "Stanwick Plastics", city: "Selangor", country: "Malaysia", cats: ["storage-shelving", "packaging-shipping"] },
  { name: "Westbrook Metal Supply", city: "Pittsburgh", country: "United States", cats: ["material-handling", "storage-shelving"] },
  { name: "Ironclad Protective Gear", city: "Bydgoszcz", country: "Poland", cats: ["safety-ppe"] },
  { name: "Nordhaven Cold Chain", city: "Aarhus", country: "Denmark", cats: ["facility-janitorial", "packaging-shipping"] },
  { name: "Aldergate Office Supply", city: "Manchester", country: "United Kingdom", cats: ["consumables-paper"] },
] as const;

export const WAREHOUSE_SEEDS = [
  { code: "DC-01", name: "Northgate Distribution Center", type: "distribution", addressLine: "4400 Corporate Exchange Blvd", city: "Columbus", region: "Ohio", country: "United States", capacityPallets: 14800, timezone: "America/New_York", openedAt: "2016-04-11" },
  { code: "DC-02", name: "Southfield Distribution Center", type: "distribution", addressLine: "2210 Valwood Parkway", city: "Dallas", region: "Texas", country: "United States", capacityPallets: 11200, timezone: "America/Chicago", openedAt: "2018-09-03" },
  { code: "FC-01", name: "Riverside Fulfillment Center", type: "fulfillment", addressLine: "1875 Vista Industrial Way", city: "Reno", region: "Nevada", country: "United States", capacityPallets: 8600, timezone: "America/Los_Angeles", openedAt: "2020-02-17" },
  { code: "RT-01", name: "Midtown Retail Depot", type: "retail", addressLine: "620 W Cermak Rd", city: "Chicago", region: "Illinois", country: "United States", capacityPallets: 2400, timezone: "America/Chicago", openedAt: "2021-06-28" },
  { code: "CS-01", name: "Harbor Cold Storage", type: "cold", addressLine: "301 Doremus Avenue", city: "Newark", region: "New Jersey", country: "United States", capacityPallets: 3900, timezone: "America/New_York", openedAt: "2022-11-14" },
  { code: "DC-03", name: "Cascade Distribution Center", type: "distribution", addressLine: "9310 NE Cascades Pkwy", city: "Portland", region: "Oregon", country: "United States", capacityPallets: 9400, timezone: "America/Los_Angeles", openedAt: "2023-08-07" },
] as const;

export const PEOPLE = [
  "Amara Okonkwo", "Daniel Reyes", "Priya Raghunathan", "Marcus Bell",
  "Lena Kowalski", "Tomás Herrera", "Yuki Nakamura", "Aisha Rahman",
  "Ethan Cole", "Sofia Marchetti", "Nils Andersen", "Grace Mbeki",
  "Ravi Deshpande", "Hannah Fitzgerald", "Omar Haddad", "Chloé Dubois",
  "Jonas Weber", "Mei-Ling Chen", "Viktor Petrov", "Isabel Santos",
  "Kwame Asante", "Nora Lindqvist", "Diego Vargas", "Fatima Al-Sayed",
  "Petr Novák", "Anjali Kapoor", "Liam O'Connor", "Zara Ahmed",
  "Felix Brandt", "Rosa Delgado", "Samuel Adeyemi", "Ingrid Hoffmann",
  "Carlos Mendes", "Yara Khalil", "Tobias Lund", "Maya Sharma",
  "Elena Rusu", "Noah Weiss",
] as const;

export const CUSTOMER_SEEDS = [
  { name: "Brightline Retail Group", type: "wholesale", city: "Indianapolis", country: "United States" },
  { name: "Cascade Hardware Co-op", type: "wholesale", city: "Seattle", country: "United States" },
  { name: "Vertex Logistics", type: "wholesale", city: "Memphis", country: "United States" },
  { name: "Summit Office Interiors", type: "retail", city: "Denver", country: "United States" },
  { name: "Harbor Point Grocers", type: "retail", city: "Baltimore", country: "United States" },
  { name: "Ironwood Construction", type: "wholesale", city: "Phoenix", country: "United States" },
  { name: "Redwood Medical Supply", type: "wholesale", city: "Sacramento", country: "United States" },
  { name: "Lakeshore Distributors", type: "wholesale", city: "Milwaukee", country: "United States" },
  { name: "Copperfield Retail", type: "retail", city: "Nashville", country: "United States" },
  { name: "Blue Ridge Outfitters", type: "retail", city: "Asheville", country: "United States" },
  { name: "Sterling Facilities Management", type: "wholesale", city: "Newark", country: "United States" },
  { name: "Kingsway Wholesale", type: "wholesale", city: "Toronto", country: "Canada" },
  { name: "Northstar Manufacturing", type: "wholesale", city: "Minneapolis", country: "United States" },
  { name: "Cedar Valley School District", type: "government", city: "Cedar Rapids", country: "United States" },
  { name: "Metro Transit Authority", type: "government", city: "Philadelphia", country: "United States" },
  { name: "Pinnacle Hotels Group", type: "wholesale", city: "Las Vegas", country: "United States" },
  { name: "Greenfield Agriculture", type: "wholesale", city: "Fresno", country: "United States" },
  { name: "Anchor Marine Supply", type: "retail", city: "Norfolk", country: "United States" },
  { name: "Foxglove Pharmacy Chain", type: "retail", city: "Charlotte", country: "United States" },
  { name: "Tidewater Seafood", type: "wholesale", city: "Portland", country: "United States" },
  { name: "Halewood Online Store", type: "online", city: "Austin", country: "United States" },
  { name: "Marketplace Direct", type: "online", city: "Columbus", country: "United States" },
  { name: "Quayside Trading", type: "online", city: "Boston", country: "United States" },
  { name: "Wexford Public Works", type: "government", city: "Albany", country: "United States" },
  { name: "Aurora Health Network", type: "wholesale", city: "Madison", country: "United States" },
  { name: "Belmont Print Services", type: "retail", city: "St. Louis", country: "United States" },
  { name: "Crescent Food Distributors", type: "wholesale", city: "New Orleans", country: "United States" },
  { name: "Drayton Electrical", type: "wholesale", city: "Birmingham", country: "United States" },
] as const;

export const CARRIERS = [
  "Meridian Freight",
  "Cascade Express",
  "Harbor Line Logistics",
  "Redstone Haulage",
  "Anchor Parcel",
] as const;

export const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "2/10 Net 30"] as const;

export const DEVICES = [
  "Chrome 141 · Windows 11",
  "Safari 19 · macOS 16",
  "Edge 141 · Windows 11",
  "Chrome 141 · ChromeOS",
  "Stockpile Scanner · Android 15",
  "Firefox 148 · Ubuntu 24.04",
] as const;
