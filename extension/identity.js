/* PersonaX Autofill - identity generator.
   Builds ONE realistic random identity. The service worker calls this a single
   time per profile and stores the result, so the same identity is reused on every
   page and every refresh (it never changes) until the user hits Regenerate. */

const PX_FIRST_NAMES = [
  "James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles",
  "Daniel","Matthew","Anthony","Mark","Donald","Steven","Andrew","Paul","Joshua","Kevin",
  "Brian","George","Timothy","Ronald","Jason","Edward","Jeffrey","Ryan","Jacob","Gary",
  "Nicholas","Eric","Jonathan","Stephen","Larry","Justin","Scott","Brandon","Benjamin","Samuel",
  "Gregory","Alexander","Patrick","Frank","Raymond","Jack","Dennis","Jerry","Tyler","Aaron",
  "Mary","Patricia","Jennifer","Linda","Elizabeth","Barbara","Susan","Jessica","Sarah","Karen",
  "Lisa","Nancy","Betty","Sandra","Margaret","Ashley","Kimberly","Emily","Donna","Michelle",
  "Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Laura","Sharon","Cynthia","Kathleen",
  "Amy","Angela","Shirley","Anna","Brenda","Pamela","Emma","Nicole","Helen","Samantha",
  "Katherine","Christine","Rachel","Olivia","Grace","Sophia","Chloe","Victoria","Hannah","Julia"
];

const PX_LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
  "Gomez","Phillips","Evans","Turner","Diaz","Parker","Cruz","Edwards","Collins","Reyes",
  "Stewart","Morris","Morales","Murphy","Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper",
  "Peterson","Bailey","Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson",
  "Watson","Brooks","Chavez","Wood","James","Bennett","Gray","Mendoza","Ruiz","Hughes",
  "Price","Alvarez","Castillo","Sanders","Patel","Myers","Long","Ross","Foster","Powell"
];

const PX_MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function pxRand(max) { return Math.floor(Math.random() * max); }
function pxPick(arr) { return arr[pxRand(arr.length)]; }

function pxStrongPassword() {
  // 3 words-ish + digits + symbol, easy to type but strong and unique.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%&*";
  let core = pxPick(["Sky","Blue","Red","Gold","Star","Moon","Fox","Oak","Wolf","Jet","Ace","Iron","Nova","Zen","Echo"]);
  core += pxPick(["Ridge","Point","Field","Stone","Wood","Lake","Hill","Wave","Peak","Gate","Cove","Fall"]);
  let p = upper[pxRand(upper.length)] + core.toLowerCase();
  p = p.charAt(0).toUpperCase() + p.slice(1);
  for (let i = 0; i < 4; i++) p += digit[pxRand(digit.length)];
  p += sym[pxRand(sym.length)];
  // ensure it has at least one lower already (it does) and length >= 12
  return p;
}

function pxGenerateIdentity() {
  const first = pxPick(PX_FIRST_NAMES);
  const last = pxPick(PX_LAST_NAMES);

  const nick = (first + last).toLowerCase().replace(/[^a-z]/g, "");
  const suffix = String(10 + pxRand(9990)); // 2-4 digits
  const username = nick + suffix;           // e.g. jamessmith8472

  // Adult date of birth: age 19-52, day 1-28 (safe for every month).
  const nowYear = new Date().getFullYear();
  const age = 19 + pxRand(34);
  const year = nowYear - age;
  const monthNum = 1 + pxRand(12);          // 1-12
  const day = 1 + pxRand(28);               // 1-28

  return {
    first_name: first,
    last_name: last,
    full_name: first + " " + last,
    username: username,                     // what Outlook signup asks for
    email: username + "@outlook.com",       // full address
    password: pxStrongPassword(),
    dob_day: String(day),
    dob_month: String(monthNum),            // "1".."12"
    dob_month_name: PX_MONTH_NAMES[monthNum - 1],
    dob_year: String(year),
    gender: pxPick(["Male", "Female"]),
    country: "United States"
  };
}

// exported for the service worker (importScripts) and available as globals in tests
if (typeof self !== "undefined") {
  self.pxGenerateIdentity = pxGenerateIdentity;
  self.PX_MONTH_NAMES = PX_MONTH_NAMES;
}
