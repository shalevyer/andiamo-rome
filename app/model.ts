import { z } from 'zod';
const short = z.string().max(300),
  note = z.string().max(12000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(new Date(v + 'T12:00:00Z').getTime()));
const time = z
  .string()
  .regex(/^(?:[0-2]\d:[0-5]\d)?$/)
  .refine((v) => !v || Number(v.slice(0, 2)) < 24);
const link = z
  .string()
  .max(2000)
  .refine((v) => !v || /^https?:\/\//i.test(v));
export const stopSchema = z.object({
  id: short.min(1),
  order: z.number().finite(),
  day: z.number().int().min(0).max(5),
  title: short.min(1),
  zone: z.enum(['Europe/Rome', 'Asia/Jerusalem']).default('Europe/Rome'),
  time,
  duration: short,
  category: z.enum(['sight', 'food', 'coffee', 'transfer', 'free']),
  location: short,
  notes: note,
  url: link,
  reference: short,
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  done: z.boolean(),
  status: z.enum(['draft', 'planned', 'booked', 'optional']),
});
export const bookingSchema = z.object({
  id: short.min(1),
  type: z.enum(['flight', 'stay', 'other']),
  title: short.min(1),
  date: z.union([date, z.literal('')]),
  endDate: z.union([date, z.literal('')]),
  time,
  endTime: time,
  from: short,
  to: short,
  number: short,
  reference: short,
  address: short,
  phone: short,
  notes: note,
  url: link,
  status: z.enum(['planned', 'reserved', 'checked-in']),
});
export const checkSchema = z.object({
  id: short.min(1),
  text: short.min(1),
  done: z.boolean(),
  group: z.enum(['before', 'packing']),
});
export const tripSchema = z.object({
  start: date,
  days: z.array(short).length(6),
  dayNotes: z.array(note).length(6),
  stops: z.array(stopSchema).max(500),
  bookings: z.array(bookingSchema).max(100),
  checks: z.array(checkSchema).max(200),
  notes: note,
  receipts: z.array(short).max(100),
});
export const opSchema = z.discriminatedUnion('type', [
  z.object({ id: short, type: z.literal('stop'), value: stopSchema }),
  z.object({ id: short, type: z.literal('deleteStop'), value: short }),
  z.object({
    id: short,
    type: z.literal('done'),
    value: z.object({ id: short, done: z.boolean() }),
  }),
  z.object({ id: short, type: z.literal('booking'), value: bookingSchema }),
  z.object({ id: short, type: z.literal('deleteBooking'), value: short }),
  z.object({ id: short, type: z.literal('check'), value: checkSchema }),
  z.object({ id: short, type: z.literal('deleteCheck'), value: short }),
  z.object({
    id: short,
    type: z.literal('move'),
    value: z.object({ id: short, direction: z.enum(['up', 'down']) }),
  }),
  z.object({ id: short, type: z.literal('notes'), value: note }),
  z.object({
    id: short,
    type: z.literal('day'),
    value: z.object({ day: z.number().int().min(0).max(5), title: short.min(1), notes: note }),
  }),
  z.object({ id: short, type: z.literal('start'), value: date }),
  z.object({ id: short, type: z.literal('restore'), value: tripSchema }),
]);
export type Stop = z.infer<typeof stopSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type Trip = z.infer<typeof tripSchema>;
export type Operation = z.infer<typeof opSchema>;
export const categories = {
  sight: 'לגלות',
  food: 'לאכול',
  coffee: 'קפה ומשהו טוב',
  transfer: 'בדרך',
  free: 'בקצב שלנו',
};
export const statuses = {
  draft: 'טיוטה',
  planned: 'בתוכנית',
  booked: 'הוזמן',
  optional: 'אולי, אם יתחשק',
};
export const dayDate = (start: string, day: number) => {
  const d = new Date(start + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d;
};
export const isoDay = (start: string, day: number) =>
  dayDate(start, day).toISOString().slice(0, 10);
export const dateLabel = (start: string, day: number, long = false) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { weekday: 'long' as const } : {}),
  }).format(dayDate(start, day));
export const sortStops = (a: Stop, b: Stop) => a.order - b.order;
export const mapUrl = (location: string) =>
  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);
const orders = [0, 0, 0, 0, 0, 0];
const S = (
  id: string,
  day: number,
  title: string,
  time: string,
  category: Stop['category'],
  location: string,
  lat: number | null,
  lng: number | null,
  notes: string,
  status: Stop['status'] = 'draft'
): Stop => ({
  id,
  order: orders[day]++,
  day,
  title,
  zone: id === 'arrival-flight' ? 'Asia/Jerusalem' : 'Europe/Rome',
  time,
  duration: '',
  category,
  location,
  lat,
  lng,
  notes,
  status,
  done: false,
  url: '',
  reference: '',
});
const B = (
  id: string,
  type: Booking['type'],
  title: string,
  date: string,
  time: string,
  endDate: string,
  endTime: string,
  from: string,
  to: string,
  number: string,
  address: string,
  phone: string,
  notes: string,
  url: string
): Booking => ({
  id,
  type,
  title,
  date,
  time,
  endDate,
  endTime,
  from,
  to,
  number,
  address,
  phone,
  notes,
  url,
  reference: '',
  status: 'reserved',
});
export const initialTrip: Trip = {
  start: '2026-11-18',
  days: [
    'צ׳או, רומא',
    'מכירים את העיר',
    'רומא היהודית וקצת שופינג',
    'יום של אמנות וירוק',
    'ריצה, שווקים ולילה בחוץ',
    'עוד קפה אחד, ודי',
  ],
  dayNotes: [
    'היום הראשון לפי הטיוטה של מיה. הגעה לאזור ויה דל קורסו סביב 11:30. לפי אישור הלינה הכניסה לחדר מתחילה ב־15:00; השארת מזוודות מוקדם עדיין לתיאום.',
    'יום היכרות עם רומא. השארנו את המסלול פתוח לבחירה של מיה — בלי להעמיס מקומות שלא בחרתם.',
    'יום יהדות רומא ושופינג. הוותיקן הוא אפשרות בלבד. צריך לחדד את סן אנג׳לו ואת שם המזרקה ליד הגטו.',
    'וילה בורגזה וברבריני, לפי הטיוטה. עדיין פתוח אם ברבריני הוא הכיכר או הארמון.',
    'בוקר של ריצה בווילה אדה, אחר כך שווקים. היציאה ל־Sanctuary בערב עדיין דורשת בדיקת האירוע והזמנה.',
    'קפה וסיבוב אחרון לפני שחוזרים. יציאה מהחדר עד 10:00 וטיסה ב־20:00: כדאי לתאם שמירת מזוודות ולהחליט מתי יוצאים לשדה.',
  ],
  stops: [
    S(
      'arrival-flight',
      0,
      'ממריאים לרומא',
      '06:55',
      'transfer',
      'Ben Gurion Airport, Terminal 3',
      null,
      null,
      'ישראייר 6H343 · נחיתה ב־FCO בשעה 09:40 לפי הכרטיסים. טרם בוצע צ׳ק־אין. שעות הטיסות מקומיות.',
      'booked'
    ),
    S(
      'arrival-train',
      0,
      'רכבת לטרמיני, ומשם למרכז',
      '',
      'transfer',
      'Roma Termini',
      41.9009,
      12.5021,
      'לפי מיה: רכבת משדה התעופה לטרמיני, ואז מטרו לכיוון ויה דל קורסו. הקו, תחנת הירידה והשעות עדיין לבחירה.'
    ),
    S(
      'arrival-coffee',
      0,
      'קפה ראשון וסיבוב באזור',
      '11:30',
      'coffee',
      'Via del Corso, Roma',
      41.9057,
      12.4782,
      'זמן ההגעה משוער לפי הטיוטה. קפה, משהו קטן לאכול וסיבוב עד שהחדר מוכן.'
    ),
    S(
      'arrival-stay',
      0,
      'נכנסים, מתרעננים, נושמים',
      '15:00',
      'free',
      'Via di Ripetta 229, Roma',
      41.9081167,
      12.4759667,
      'Ripetta Luxurious Suites · כניסה לפי אישור ההזמנה: 15:00–22:00. מקלחת והתארגנות קלה לערב.',
      'booked'
    ),
    S(
      'arrival-evening',
      0,
      'הערב הראשון שלנו',
      '',
      'food',
      '',
      null,
      null,
      'מקום פתוח בתוכנית של מיה. נחליט על ארוחת ערב או יציאה כשיתחשק.'
    ),
    S(
      'thursday-explore',
      1,
      'מכירים את רומא ברגל',
      '',
      'sight',
      'Centro Storico, Roma',
      41.8992,
      12.4768,
      'יום תיירות והיכרות עם רומא, כמו שמיה תכננה. נוסיף את העצירות כשייבחרו.'
    ),
    S(
      'friday-jewish',
      2,
      'רומא היהודית',
      '',
      'sight',
      'Ghetto Ebraico, Roma',
      41.8924,
      12.4772,
      'להסתובב באזור הגטו היהודי. האתרים, השעות והכרטיסים עוד לא נקבעו.'
    ),
    S(
      'friday-angelo',
      2,
      'סן אנג׳לו',
      '',
      'sight',
      '',
      null,
      null,
      'לברר עם מיה: רובע Sant’Angelo או טירת Castel Sant’Angelo? השארנו ללא סיכה במפה עד שנדע.'
    ),
    S(
      'friday-fountain',
      2,
      'המזרקה ליד הגטו',
      '',
      'sight',
      '',
      null,
      null,
      'לפי הטיוטה: המזרקה עם הכניסה ליד הגטו. השם והמיקום המדויק עדיין לא אושרו.'
    ),
    S(
      'friday-shopping',
      2,
      'קצת שופינג לכיף',
      '',
      'free',
      '',
      null,
      null,
      'להשאיר זמן לחנויות, עצירות ספונטניות ומשהו טעים בדרך.'
    ),
    S(
      'friday-vatican',
      2,
      'אולי קופצים לוותיקן',
      '',
      'sight',
      'Vatican City',
      41.9022,
      12.4573,
      'אפשרות מהטיוטה בלבד. להחליט אם מתאים ליום ולבדוק זמינות אם רוצים להיכנס.',
      'optional'
    ),
    S(
      'friday-dinner',
      2,
      'מסעדה ובר, או בית חב״ד',
      '',
      'food',
      '',
      null,
      null,
      'שתי אפשרויות לערב מהטיוטה של מיה. המקום וההזמנה עדיין פתוחים.'
    ),
    S(
      'saturday-villa',
      3,
      'וילה בורגזה',
      '',
      'free',
      'Villa Borghese, Roma',
      41.9123,
      12.4852,
      'הפארק מופיע בטיוטה של מיה. כניסה לגלריה בורגזה לא נכללה בתוכנית, ואינה מוזמנת.'
    ),
    S(
      'saturday-barberini',
      3,
      'ברבריני',
      '',
      'sight',
      '',
      null,
      null,
      'לחדד אם הכוונה לפיאצה ברבריני או לפאלאצו ברבריני. נוסיף כתובת כשתבחרו.'
    ),
    S(
      'sunday-run',
      4,
      'ריצת בוקר בווילה אדה',
      '',
      'free',
      'Villa Ada, Roma',
      41.935,
      12.5011,
      'לפתוח את היום בריצה. השעה, האורך והמסלול לבחירתכם.'
    ),
    S(
      'sunday-markets',
      4,
      'יום שווקים',
      '',
      'free',
      '',
      null,
      null,
      'השווקים עוד לא נבחרו. נשאיר מקום למה שמיה תמצא.'
    ),
    S(
      'sunday-party',
      4,
      'לילה ב־Sanctuary',
      '',
      'food',
      '',
      null,
      null,
      'לפי מיה: מסיבה בסנקצוורי. טרם אומתו המקום, האירוע, שעות הפתיחה או ההזמנה.',
      'optional'
    ),
    S(
      'monday-checkout',
      5,
      'נפרדים מהחדר',
      '10:00',
      'free',
      'Via di Ripetta 229, Roma',
      41.9081167,
      12.4759667,
      'באישור ההזמנה: צ׳ק־אאוט 08:00–10:00. שמירת מזוודות אחרי העזיבה עדיין לא תואמה.',
      'booked'
    ),
    S(
      'monday-coffee',
      5,
      'עוד קפה וסיבוב באזור',
      '',
      'coffee',
      '',
      null,
      null,
      'בוקר בקפה וטיול באזור, לפי התוכנית של מיה.'
    ),
    S(
      'monday-airport',
      5,
      'נוסעים לשדה התעופה',
      '',
      'transfer',
      'Fiumicino Airport, Roma',
      41.8003,
      12.2389,
      'נחליט יחד על שעת היציאה ואמצעי התחבורה. הטיסה ב־20:00; לבדוק את הנחיות חברת התעופה.'
    ),
    S(
      'return-flight',
      5,
      'בחזרה הביתה',
      '20:00',
      'transfer',
      'Fiumicino Airport, Roma',
      41.8003,
      12.2389,
      'ישראייר 6H350 · נחיתה בנתב״ג ב־00:20 ביום שלישי, 24.11. טרם בוצע צ׳ק־אין. שעות מקומיות.',
      'booked'
    ),
  ],
  bookings: [
    B(
      'outbound',
      'flight',
      'טסים לרומא',
      '2026-11-18',
      '06:55',
      '2026-11-18',
      '09:40',
      'TLV',
      'FCO',
      '6H343',
      '',
      '',
      'ישראייר · טרמינל 3 בנתב״ג לפי הכרטיס. הכרטיסים הם אישורי טיסה, לא כרטיסי עלייה למטוס.',
      'https://myisrair.israir.co.il/'
    ),
    B(
      'inbound',
      'flight',
      'חוזרים הביתה',
      '2026-11-23',
      '20:00',
      '2026-11-24',
      '00:20',
      'FCO',
      'TLV',
      '6H350',
      '',
      '',
      'ישראייר · הנחיתה ביום שלישי 24.11, אחרי חצות. טרמינל היציאה ברומא לא מופיע בכרטיסים.',
      'https://myisrair.israir.co.il/'
    ),
    B(
      'stay',
      'stay',
      'Ripetta Luxurious Suites',
      '2026-11-18',
      '15:00',
      '2026-11-23',
      '10:00',
      '',
      '',
      '',
      'Via di Ripetta 229, 00186 Roma',
      '+393371688261',
      '5 לילות · 2 אורחים · חדר סופיריור טריפל. כניסה 15:00–22:00, יציאה 08:00–10:00. ללא ארוחות. הסכום הסופי באישור: €644 כולל מיסים. הגעה מוקדמת ושמירת מזוודות לתיאום.',
      'https://www.booking.com/'
    ),
  ],
  checks: [
    { id: 'c1', text: 'לעשות צ׳ק־אין לטיסת ההלוך', done: false, group: 'before' },
    { id: 'c2', text: 'לתאם השארת מזוודות בהגעה ובעזיבה', done: false, group: 'before' },
    { id: 'c3', text: 'לסגור את המקומות הפתוחים בתוכנית', done: false, group: 'before' },
    { id: 'c4', text: 'לבדוק דרכונים וביטוח נסיעות', done: false, group: 'before' },
    { id: 'c5', text: 'לסדר אינטרנט לטיול', done: false, group: 'before' },
    { id: 'c6', text: 'נעליים נוחות ונעלי ריצה', done: false, group: 'packing' },
    { id: 'c7', text: 'מטענים וסוללה ניידת', done: false, group: 'packing' },
    { id: 'c8', text: 'שכבה חמה ומטרייה', done: false, group: 'packing' },
    { id: 'c9', text: 'תרופות ופריטים אישיים', done: false, group: 'packing' },
  ],
  notes: '',
  receipts: [],
};
export function applyOperation(trip: Trip, op: Operation): Trip {
  if (trip.receipts.includes(op.id)) return trip;
  const t = op.type === 'restore' ? structuredClone(op.value) : structuredClone(trip);
  const upsert = <T extends { id: string }>(items: T[], v: T) => {
    const i = items.findIndex((x) => x.id === v.id);
    if (i < 0) items.push(v);
    else items[i] = v;
  };
  switch (op.type) {
    case 'move': {
      const stop = t.stops.find((s) => s.id === op.value.id);
      if (!stop) break;
      const list = t.stops.filter((s) => s.day === stop.day).sort(sortStops);
      const index = list.findIndex((s) => s.id === stop.id),
        other = list[index + (op.value.direction === 'up' ? -1 : 1)];
      if (other) {
        const order = stop.order;
        stop.order = other.order;
        other.order = order;
      }
      break;
    }
    case 'stop':
      upsert(t.stops, op.value);
      break;
    case 'deleteStop':
      t.stops = t.stops.filter((x) => x.id !== op.value);
      break;
    case 'done':
      t.stops = t.stops.map((x) => (x.id === op.value.id ? { ...x, done: op.value.done } : x));
      break;
    case 'booking':
      upsert(t.bookings, op.value);
      break;
    case 'deleteBooking':
      t.bookings = t.bookings.filter((x) => x.id !== op.value);
      break;
    case 'check':
      upsert(t.checks, op.value);
      break;
    case 'deleteCheck':
      t.checks = t.checks.filter((x) => x.id !== op.value);
      break;
    case 'notes':
      t.notes = op.value;
      break;
    case 'day':
      t.days[op.value.day] = op.value.title;
      t.dayNotes[op.value.day] = op.value.notes;
      break;
    case 'start':
      t.start = op.value;
      break;
  }
  t.receipts = [...t.receipts, op.id].slice(-100);
  return t;
}
