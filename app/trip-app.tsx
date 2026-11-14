'use client';
import {
  useEffect,
  useRef,
  useState,
  isValidElement,
  cloneElement,
  type ReactElement,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Check,
  CheckCheck,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Cloud,
  CloudOff,
  Coffee,
  Compass,
  Download,
  ExternalLink,
  FileText,
  Footprints,
  Heart,
  House,
  Info,
  Landmark,
  Leaf,
  LoaderCircle,
  Luggage,
  Map,
  MapPin,
  MoreHorizontal,
  Navigation,
  NotebookPen,
  Pencil,
  Phone,
  Plane,
  Plus,
  Search,
  Share2,
  Smartphone,
  Settings2,
  ShieldCheck,
  Sun,
  Ticket,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  categories,
  statuses,
  dayDate,
  isoDay,
  dateLabel,
  sortStops,
  mapUrl,
  stopSchema,
  bookingSchema,
  tripSchema,
  type Stop,
  type Booking,
  type Trip,
  type Operation,
} from './model';
import { useTrip } from './use-trip';
import TripMap from './trip-map';
import Dialog from './dialog';
import StopDetails from './stop-details';
import { documents, documentAvailability, saveDocument, openDocument } from './documents';
import { createTripLink, readTripLink } from './share';
const icons = { sight: Landmark, food: Utensils, coffee: Coffee, transfer: Plane, free: Leaf };
const nav = [
  { id: 'plan', label: 'הטיול שלנו', icon: CalendarDays },
  { id: 'map', label: 'על המפה', icon: Map },
  { id: 'bookings', label: 'ההזמנות', icon: Ticket },
  { id: 'essentials', label: 'הדברים הקטנים', icon: CheckSquare2 },
] as const;
type Tab = (typeof nav)[number]['id'];
type Modal =
  | { type: 'stop'; value?: Stop; edit?: boolean }
  | { type: 'booking'; value?: Booking; kind?: Booking['type'] }
  | { type: 'day' }
  | { type: 'notes' }
  | { type: 'settings' }
  | { type: 'share' }
  | { type: 'sharedTrip'; value: Trip }
  | { type: 'check'; group: 'before' | 'packing' }
  | { type: 'delete'; kind: 'stop' | 'booking'; id: string; title: string }
  | null;
const uid = () => crypto.randomUUID();
const download = (name: string, content: string, type = 'application/json') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={'field ' + (wide ? 'wide' : '')}>
      <span>{label}</span>
      {isValidElement(children) &&
      typeof children.type === 'string' &&
      ['input', 'select', 'textarea'].includes(children.type)
        ? cloneElement(children as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
        : children}
    </label>
  );
}
function Empty({
  icon: Icon = Compass,
  title,
  text,
  action,
}: {
  icon?: any;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Status({ state, retry }: { state: string; retry: () => void }) {
  const Icon = state === 'error' ? CloudOff : state === 'loading' ? LoaderCircle : Smartphone;
  return (
    <button className={'save-status ' + state} onClick={retry} title="השינויים נשמרים במכשיר הזה">
      <Icon size={15} />
      <span>{state === 'error' ? 'לא נשמר — הורידו גיבוי' : state === 'loading' ? 'טוענים…' : 'שמור במכשיר'}</span>
    </button>
  );
}
function StopCard({
  stop,
  index,
  onOpen,
  onEdit,
  onDone,
  onMap,
}: {
  stop: Stop;
  index: number;
  onOpen: () => void;
  onEdit: () => void;
  onDone: () => void;
  onMap: () => void;
}) {
  const Icon = icons[stop.category];
  return (
    <article
      className={'stop-row ' + (stop.done ? 'completed' : '')}
      style={{ '--stop-index': index } as CSSProperties}
    >
      <div className="timeline-time">
        <span dir={stop.time ? 'ltr' : 'rtl'}>{stop.time || 'פתוח'}</span>
        <span className={'timeline-dot ' + stop.category}>
          <Icon size={16} />
        </span>
      </div>
      <div className="stop-card">
        <div className="stop-main">
          <button className="stop-open" onClick={onOpen}>
            <div className="stop-category">
              <span>{categories[stop.category]}</span>
              {stop.duration && (
                <>
                  <span>·</span>
                  <span>{stop.duration}</span>
                </>
              )}
            </div>
            <h3>{stop.title}</h3>
            {stop.location && (
              <p className="stop-location">
                <bdi>{stop.location}</bdi>
              </p>
            )}
          </button>
          <button
            className={'done-button ' + (stop.done ? 'checked' : '')}
            aria-label={
              stop.done ? 'סימון ' + stop.title + ' כלא בוצע' : 'סימון ' + stop.title + ' כבוצע'
            }
            aria-pressed={stop.done}
            onClick={onDone}
          >
            <span className="done-circle">
              <Check size={14} />
            </span>
          </button>
        </div>
        <div className="stop-bottom">
          <div>
            {stop.status !== 'draft' && (
              <span className={'badge ' + stop.status}>
                {stop.status === 'booked' ? (
                  <Check size={11} />
                ) : stop.status === 'optional' ? (
                  <Plus size={11} />
                ) : null}
                {statuses[stop.status]}
              </span>
            )}
          </div>
          <div className="inline-actions">
            {stop.location && (
              <button className="text-button navigate-stop" onClick={onMap}>
                <Navigation size={13} />
                למפות
              </button>
            )}
            <button
              className="icon-button small"
              aria-label={'עריכת ' + stop.title}
              onClick={onEdit}
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
function BookingCard({
  booking: b,
  onEdit,
  onCopy,
}: {
  booking: Booking;
  onEdit: () => void;
  onCopy: (s: string) => void;
}) {
  return (
    <article className={'booking-card ' + b.type}>
      <div className="booking-header">
        <span className="booking-symbol">
          {b.type === 'flight' ? (
            <Plane size={20} />
          ) : b.type === 'stay' ? (
            <House size={20} />
          ) : (
            <Ticket size={20} />
          )}
        </span>
        <div>
          <span className="eyebrow">
            {b.type === 'flight'
              ? 'ישראייר · ' + b.number
              : b.type === 'stay'
              ? 'הבית שלנו ברומא'
              : 'הזמנה בטיול'}
          </span>
          <h3 dir={b.type === 'stay' ? 'ltr' : undefined}>{b.title}</h3>
        </div>
        <button className="icon-button" onClick={onEdit} aria-label={'עריכת ' + b.title}>
          <Pencil size={16} />
        </button>
      </div>
      {b.type === 'flight' ? (
        <>
          <div className="flight-route" dir="ltr">
            <div>
              <span className="airport">{b.from || '—'}</span>
              <strong>{b.time || '—'}</strong>
              <small>
                {b.date
                  ? new Intl.DateTimeFormat('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }).format(dayDate(b.date, 0))
                  : ''}
              </small>
            </div>
            <div className="flight-line">
              <Plane size={20} />
              <span />
              <small>זמנים מקומיים</small>
            </div>
            <div>
              <span className="airport">{b.to || '—'}</span>
              <strong>
                {b.endTime || '—'}
                {b.endDate && b.date && b.endDate > b.date && <sup>+1</sup>}
              </strong>
              <small>
                {b.endDate
                  ? new Intl.DateTimeFormat('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }).format(dayDate(b.endDate, 0))
                  : ''}
              </small>
            </div>
          </div>
          <div className="booking-alert">
            <Info size={14} />
            {b.status === 'checked-in'
              ? 'סומן שבוצע צ׳ק־אין — כרטיס העלייה נמצא אצלכם'
              : b.status === 'planned'
              ? 'הטיסה בתכנון · עדיין לא הוזמנה'
              : 'אישור טיסה · טרם בוצע צ׳ק־אין'}
          </div>
        </>
      ) : (
        <div className="stay-details">
          {b.address && (
            <p>
              <MapPin size={15} />
              <bdi>{b.address}</bdi>
            </p>
          )}
          <div className="stay-dates">
            <div>
              <small>{b.type === 'stay' ? 'צ׳ק־אין' : 'מתחילים'}</small>
              <strong>{b.date ? dateLabel(b.date, 0) : '—'}</strong>
              <span dir="ltr">{b.time}</span>
            </div>
            <ArrowLeft size={18} />
            <div>
              <small>{b.type === 'stay' ? 'צ׳ק־אאוט' : 'מסיימים'}</small>
              <strong>{b.endDate ? dateLabel(b.endDate, 0) : '—'}</strong>
              <span dir="ltr">{b.endTime}</span>
            </div>
            {b.type === 'stay' && (
              <div className="night-count">
                <strong>
                  {b.date && b.endDate
                    ? Math.round((+dayDate(b.endDate, 0) - +dayDate(b.date, 0)) / 86400000)
                    : '—'}
                </strong>
                <small>לילות</small>
              </div>
            )}
          </div>
        </div>
      )}
      {b.notes && <p className="booking-note">{b.notes}</p>}
      {b.reference && (
        <button className="reference" onClick={() => onCopy(b.reference)}>
          מספר הזמנה <bdi>{b.reference}</bdi>
          <span>העתקה</span>
        </button>
      )}
      <div className="booking-footer">
        <span className={'badge ' + (b.status === 'planned' ? 'draft' : 'booked')}>
          {b.status === 'planned'
            ? 'לתכנון'
            : b.status === 'checked-in'
            ? 'בוצע צ׳ק־אין'
            : 'הזמנה מאושרת'}
        </span>
        <div className="inline-actions">
          {b.phone && (
            <a className="text-button" href={'tel:' + b.phone}>
              <Phone size={14} />
              התקשרות
            </a>
          )}
          {b.address && (
            <a className="text-button" href={mapUrl(b.address)} target="_blank" rel="noreferrer">
              <Navigation size={14} />
              ניווט
            </a>
          )}
          {b.url && (
            <a className="text-button" href={b.url} target="_blank" rel="noreferrer">
              {b.type === 'flight' ? 'ניהול הטיסה' : 'לאתר ההזמנה'}
              <ArrowUpLeft size={14} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function TripApp() {
  const { trip, status, mutate, retry } = useTrip();
  const [tab, setTab] = useState<Tab>('plan'),
    [day, setDay] = useState(0),
    [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState(''),
    [mapDay, setMapDay] = useState(-1),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [dayDirection, setDayDirection] = useState(1),
    [docs, setDocs] = useState<Record<string, boolean>>({}),
    [uploading, setUploading] = useState(''),
    [shareUrl, setShareUrl] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    uploadRef = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    uploadKind = useRef('');
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const act = (op: Operation) => {
    mutate(op);
  };
  useEffect(() => {
    const raw = location.hash.slice(1);
    if (nav.some((n) => n.id === raw)) setTab(raw as Tab);
    const d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const i = Array.from({ length: 6 }, (_, i) => isoDay(trip.start, i)).indexOf(d);
    if (i >= 0) setDay(i);
  }, []);
  const selectDay = (next: number) => {
    if (next === day) return;
    setDayDirection(next > day ? 1 : -1);
    setDay(next);
    setFilter('all');
    setSearch('');
  };
  const dayKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowLeft') next = Math.min(5, index + 1);
    else if (event.key === 'ArrowRight') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 5;
    else return;
    event.preventDefault();
    selectDay(next);
    document.getElementById('day-tab-' + next)?.focus();
  };
  const changeTab = (v: Tab) => {
    setTab(v);
    history.replaceState(null, '', '#' + v);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const loadDocs = () => documentAvailability().then(setDocs).catch(() => {});
  useEffect(() => {
    loadDocs();
    readTripLink(location.hash).then(value => {
      if (value) setModal({ type: 'sharedTrip', value });
    }).catch(() => notify('הקישור אינו תקין. אפשר לבקש קישור חדש או קובץ גיבוי.'));
  }, []);
  const viewDocument = (id: string) => openDocument(id).catch(() => notify('המסמך אינו זמין במכשיר הזה. אפשר להוסיף אותו בהזמנות.'));
  const shareTrip = async () => {
    try {
      setShareUrl(await createTripLink(trip, location.href));
      setModal({ type: 'share' });
    } catch {
      notify('התוכנית גדולה מדי לקישור. אפשר לשלוח קובץ גיבוי דרך ההגדרות.');
    }
  };
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      notify('הועתק. דבר אחד פחות לזכור.');
    } catch {
      notify('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית.');
    }
  };
  const allStops = trip.stops.filter((s) => s.day === day).sort(sortStops);
  const stops = allStops.filter(
    (s) =>
      (filter === 'all' || (filter === 'done' && s.done) || (filter === 'open' && !s.done)) &&
      (!search || [s.title, s.location, s.notes].join(' ').includes(search))
  );
  const mapped = trip.stops
    .filter((s) => mapDay < 0 || s.day === mapDay)
    .sort((a, b) => a.day - b.day || sortStops(a, b));
  const romeToday = new Date(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()) + 'T12:00:00Z'
  );
  const daysToGo = Math.max(0, Math.round((+dayDate(trip.start, 0) - +romeToday) / 86400000));
  const pinNumbers = new globalThis.Map(
    mapped
      .filter((s) => s.lat !== null && s.lng !== null && s.category !== 'transfer')
      .map((s, i) => [s.id, i + 1])
  );
  const completed = allStops.filter((s) => s.done).length;
  const stay = trip.bookings.find((b) => b.type === 'stay');
  const outgoing =
    trip.bookings.find((b) => b.id === 'outbound') ||
    trip.bookings.find((b) => b.type === 'flight');
  const openMap = (s: Stop) => window.open(mapUrl(s.location), '_blank', 'noopener,noreferrer');
  const upload = async (file: File) => {
    const kind = uploadKind.current;
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      notify('אפשר להעלות קובץ PDF עד 10MB');
      return;
    }
    setUploading(kind);
    try {
      await saveDocument(kind, file);
      setDocs((d) => ({ ...d, [kind]: true }));
      notify('המסמך נשמר במכשיר הזה בלבד');
    } catch {
      notify('הקובץ לא נשמר. בדקו שזה PDF תקין עד 10MB ושיש מקום במכשיר.');
    } finally {
      setUploading('');
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };
  const exportTrip = () => {
    download(
      'andiamo-rome-backup.json',
      JSON.stringify({ format: 'andiamo-v1', exportedAt: new Date().toISOString(), trip }, null, 2)
    );
    notify('הגיבוי הורד למכשיר');
  };
  const importTrip = async (file: File) => {
    try {
      if (file.size > 1000000) throw Error();
      const data = JSON.parse(await file.text());
      const t = tripSchema.parse(data.trip || data);
      if (!window.confirm('לשחזר מהגיבוי? התוכנית, ההזמנות והרשימות הנוכחיות יוחלפו.')) return;
      act({ id: uid(), type: 'restore', value: t });
      notify('הטיול שוחזר מהגיבוי');
      setModal(null);
    } catch {
      notify('הקובץ אינו גיבוי תקין של Andiamo');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };
  const exportCalendar = () => {
    const esc = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const events = trip.stops
      .filter((s) => s.time)
      .map((s) =>
        [
          'BEGIN:VEVENT',
          'UID:' + s.id + '@andiamo',
          'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
          'DTSTART;TZID=' +
            s.zone +
            ':' +
            isoDay(trip.start, s.day).replace(/-/g, '') +
            'T' +
            s.time.replace(':', '') +
            '00',
          'SUMMARY:' + esc(s.title),
          'LOCATION:' + esc(s.location),
          'DESCRIPTION:' + esc(s.notes),
          'END:VEVENT',
        ].join('\r\n')
      );
    download(
      'andiamo-rome.ics',
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Andiamo//Rome//HE',
        'X-WR-CALNAME:רומא, רק שנינו',
        'X-WR-TIMEZONE:Europe/Rome',
        ...events,
        'END:VCALENDAR',
      ].join('\r\n'),
      'text/calendar'
    );
    notify('הקובץ ליומן הורד — עם אזור הזמן של כל עצירה');
  };
  return (
    <div className="app-shell">
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <a
              className="brand"
              href="#plan"
              onClick={(e) => {
                e.preventDefault();
                changeTab('plan');
              }}
              aria-label="Andiamo — הטיול שלנו"
            >
              <span>
                andiamo<span className="brand-period">.</span>
              </span>
              <svg viewBox="0 0 28 30" width="25" height="28" aria-hidden="true">
                <path
                  d="M5 26V13a9 9 0 0 1 18 0v13M10 26V13a4 4 0 0 1 8 0v13M3 26h9m4 0h9M4 12h6m8 0h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </a>
            <nav className="header-nav" aria-label="ניווט ראשי">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={tab === n.id ? 'active' : ''}
                  aria-current={tab === n.id ? 'page' : undefined}
                  onClick={() => changeTab(n.id)}
                >
                  <n.icon size={17} />
                  <span>{n.label}</span>
                </button>
              ))}
            </nav>
            <div className="topbar-right">
              <Status state={status} retry={retry} />
              <button className="icon-button" aria-label="שיתוף התוכנית המעודכנת" onClick={shareTrip}>
                <Share2 size={18} />
              </button>
              <div className="avatars" aria-label="Shalev & Mia">
                <span>S</span>
                <span>M</span>
              </div>
              <button
                className="icon-button topbar-settings"
                aria-label="הגדרות וגיבוי"
                onClick={() => setModal({ type: 'settings' })}
              >
                <Settings2 size={19} />
              </button>
            </div>
          </div>
        </header>
        {status === 'error' && (
          <div className="connection-banner" role="status">
            <CloudOff size={16} />
            <span>השינויים פתוחים כאן, אבל לא נשמרו במכשיר. כדאי להוריד גיבוי לפני שסוגרים.</span>
            <button onClick={exportTrip}>הורדת גיבוי</button>
          </div>
        )}
        <main id="main" key={tab} className="content">
          {tab === 'plan' && (
            <>
              <section className="trip-intro" aria-label="הטיול של Shalev ומיה לרומא">
                <div className="intro-copy">
                  <div className="trip-kicker">
                    <span className="italian-flag" aria-label="איטליה" />
                    החופשה של <bdi>Shalev & Mia</bdi>
                    <span className="kicker-dot" />
                    18—23 בנובמבר
                  </div>
                  <h1>
                    רומא, <span>בקצב שלנו.</span>
                  </h1>
                  <p>התוכנית של מיה. העצירות שלנו. וכל מה שביניהן.</p>
                  <div className="intro-meta">
                    <span>
                      6 ימים <span>·</span> 5 לילות
                    </span>
                    <span className="departure-chip">
                      <Plane size={13} />
                      {daysToGo ? `ממריאים בעוד ${daysToGo} ימים` : 'צ׳או, רומא'}
                    </span>
                  </div>
                </div>
                <div className="intro-photo">
                  <img src="./rome-warm.jpg" alt="מזרקת טרווי ברומא" />
                  <span className="photo-caption">
                    <span>ROMA</span>
                    <span>41°54′ N</span>
                  </span>
                  <span className="photo-ticket">
                    18—23 <small>NOV</small>
                  </span>
                </div>
              </section>
              <div className="quick-strip">
                <button onClick={() => changeTab('bookings')}>
                  <Plane size={17} />
                  <span>
                    <small>הטיסה שלנו</small>
                    <strong>
                      <bdi>
                        {outgoing?.from || 'TLV'} → {outgoing?.to || 'FCO'}
                      </bdi>
                      <span dir="ltr">{outgoing?.time || '06:55'}</span>
                    </strong>
                  </span>
                  <ArrowUpLeft size={15} />
                </button>
                <button onClick={() => changeTab('bookings')}>
                  <House size={17} />
                  <span>
                    <small>איפה ישנים</small>
                    <strong className="stay-name" dir="ltr">
                      {stay?.title || 'מוסיפים את הלינה'}
                    </strong>
                  </span>
                  <ArrowUpLeft size={15} />
                </button>
                <button onClick={() => changeTab('essentials')}>
                  <CheckSquare2 size={17} />
                  <span>
                    <small>לפני הטיול</small>
                    <strong>
                      {trip.checks.filter((c) => !c.done && c.group === 'before').length} דברים
                      קטנים לסגור
                    </strong>
                  </span>
                  <ArrowUpLeft size={15} />
                </button>
              </div>
              <div className="section-heading plan-heading">
                <div className="plan-title">
                  <h2>שישה ימים ברומא</h2>
                  <span>ככה זה נראה בינתיים</span>
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'stop' })}>
                  <Plus size={17} />
                  הוספת עצירה
                </button>
              </div>
              <div
                className="day-tabs"
                style={{ '--selected-day': day } as CSSProperties}
                role="tablist"
                aria-label="ימי הטיול"
              >
                {trip.days.map((title, i) => (
                  <button
                    key={i}
                    role="tab"
                    tabIndex={day === i ? 0 : -1}
                    aria-selected={day === i}
                    aria-controls="day-panel"
                    id={'day-tab-' + i}
                    className={day === i ? 'selected' : ''}
                    onClick={() => selectDay(i)}
                    onKeyDown={(event) => dayKey(event, i)}
                  >
                    <span className="day-weekday">
                      {new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(
                        dayDate(trip.start, i)
                      )}
                    </span>
                    <strong>
                      {dayDate(trip.start, i).getUTCDate()}
                      <small>נוב׳</small>
                    </strong>
                    <span className="day-label">
                      {
                        [
                          'נחיתה רכה',
                          'העיר ברגל',
                          'יהדות ושופינג',
                          'אמנות וירוק',
                          'שווקים ולילה',
                          'עוד קפה אחד',
                        ][i]
                      }
                    </span>
                    {trip.stops.some((s) => s.day === i) &&
                      trip.stops.filter((s) => s.day === i).every((s) => s.done) && (
                        <Check className="day-complete" size={12} />
                      )}
                  </button>
                ))}
              </div>
              <div className="plan-grid">
                <section
                  key={day}
                  className="day-panel"
                  style={{ '--day-direction': dayDirection } as CSSProperties}
                  id="day-panel"
                  role="tabpanel"
                  aria-labelledby={'day-tab-' + day}
                >
                  <div className="day-heading">
                    <div>
                      <span className="eyebrow">{dateLabel(trip.start, day, true)}</span>
                      <h2>
                        {trip.days[day]}
                        <button
                          className="icon-button small"
                          aria-label="עריכת כותרת היום"
                          onClick={() => setModal({ type: 'day' })}
                        >
                          <Pencil size={14} />
                        </button>
                      </h2>
                    </div>
                    <span
                      className="day-progress"
                      aria-label={`${completed} מתוך ${allStops.length} עצירות בוצעו`}
                    >
                      <svg width="29" height="29" viewBox="0 0 32 32" aria-hidden="true">
                        <circle className="progress-ring-track" cx="16" cy="16" r="12" />
                        <circle
                          className="progress-ring-value"
                          cx="16"
                          cy="16"
                          r="12"
                          pathLength="100"
                          strokeDasharray={`${
                            allStops.length ? (completed / allStops.length) * 100 : 0
                          } 100`}
                        />
                      </svg>
                      <span>
                        {completed > 0 ? (
                          <>
                            <bdi>
                              {completed}/{allStops.length}
                            </bdi>{' '}
                            בוצעו
                          </>
                        ) : (
                          `${allStops.length} עצירות`
                        )}
                      </span>
                    </span>
                  </div>
                  {trip.dayNotes[day] && (
                    <details className="day-note">
                      <summary>
                        <NotebookPen size={15} />
                        <span>{trip.dayNotes[day]}</span>
                        <ChevronDown size={14} />
                      </summary>
                      <p>{trip.dayNotes[day]}</p>
                    </details>
                  )}
                  <div className="timeline-tools">
                    <div className="segmented" aria-label="סינון עצירות">
                      {[
                        ['all', 'הכול'],
                        ['open', 'לפנינו'],
                        ['done', 'כבר היינו'],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          aria-pressed={filter === v}
                          className={filter === v ? 'active' : ''}
                          onClick={() => setFilter(v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="search-box">
                      <Search size={15} />
                      <input
                        aria-label="חיפוש בתוכנית היום"
                        placeholder="חיפוש ביום הזה"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="timeline">
                    {stops.length ? (
                      stops.map((s, i) => (
                        <StopCard
                          key={s.id}
                          stop={s}
                          index={i}
                          onOpen={() => setModal({ type: 'stop', value: s })}
                          onEdit={() => setModal({ type: 'stop', value: s, edit: true })}
                          onDone={() => {
                            act({ id: uid(), type: 'done', value: { id: s.id, done: !s.done } });
                            if (!s.done) {
                              if ('vibrate' in navigator) navigator.vibrate(8);
                              notify('היינו, נהנינו. עוד רגע לאוסף.');
                            }
                          }}
                          onMap={() => openMap(s)}
                        />
                      ))
                    ) : (
                      <Empty
                        title={allStops.length ? 'לא מצאנו עצירות כאלה' : 'היום הזה עוד פתוח'}
                        text={
                          allStops.length
                            ? 'אפשר לשנות את החיפוש או את הסינון.'
                            : 'קפה, רחוב יפה או משהו שמיה מצאה — מוסיפים כאן.'
                        }
                        action={
                          <button
                            className="button secondary"
                            onClick={() =>
                              allStops.length
                                ? (setSearch(''), setFilter('all'))
                                : setModal({ type: 'stop' })
                            }
                          >
                            {allStops.length ? 'הצגת כל העצירות' : 'הוספת העצירה הראשונה'}
                          </button>
                        }
                      />
                    )}
                  </div>
                  <button className="add-stop" onClick={() => setModal({ type: 'stop' })}>
                    <span className="add-stop-plus">
                      <Plus size={17} />
                    </span>
                    <span>נשאיר מקום לעוד משהו?</span>
                    <ArrowLeft size={16} />
                  </button>
                  <p className="timeline-foot">
                    <Clock3 size={12} />
                    זמנים לפי שעון רומא. בטיסות — השעה המקומית בכל שדה.
                  </p>
                </section>
                <aside className="day-aside">
                  <div className="aside-card map-card">
                    <div className="aside-heading">
                      <h3>היום על המפה</h3>
                      <button
                        className="icon-button"
                        aria-label="פתיחת המפה המלאה"
                        onClick={() => {
                          setMapDay(day);
                          changeTab('map');
                        }}
                      >
                        <ArrowUpLeft size={17} />
                      </button>
                    </div>
                    <TripMap
                      stops={allStops}
                      onSelect={(s) => setModal({ type: 'stop', value: s })}
                    />
                    <button
                      className="map-expand"
                      onClick={() => {
                        setMapDay(day);
                        changeTab('map');
                      }}
                    >
                      לכל המקומות
                      <ArrowLeft size={15} />
                    </button>
                  </div>
                  {stay && (
                    <div className="stay-shortcut">
                      <div className="stay-shortcut-heading">
                        <House size={17} />
                        <span>הבית שלנו ברומא</span>
                      </div>
                      <h3 dir="ltr">{stay.title}</h3>
                      <p>
                        <bdi>{stay.address}</bdi>
                      </p>
                      <div>
                        <a
                          className="text-button"
                          href={mapUrl(stay.address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation size={14} />
                          בחזרה לחדר
                        </a>
                        <button className="text-button" onClick={() => changeTab('bookings')}>
                          פרטי ההזמנה
                          <ChevronLeft size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <button className="notes-card" onClick={() => setModal({ type: 'notes' })}>
                    <span>
                      <NotebookPen size={17} />
                      <strong>פתק בינינו</strong>
                      <Plus size={15} />
                    </span>
                    <p>
                      {trip.notes
                        ? trip.notes.slice(0, 140)
                        : 'מסעדה ששמענו עליה? המלצה שקיבלנו? נרשום לפני שנשכח.'}
                    </p>
                    {trip.notes && (
                      <span className="text-link">
                        לפתק המלא
                        <ArrowLeft size={13} />
                      </span>
                    )}
                  </button>
                </aside>
              </div>
            </>
          )}
          {tab === 'map' && (
            <>
              <PageHeading
                eyebrow="כל הדרכים שלנו"
                title="רומא, על המפה"
                description="המקומות מהתוכנית והבית שלנו, במבט אחד."
              />
              <div className="map-toolbar">
                <label className="select-inline">
                  <CalendarDays size={17} />
                  <select
                    aria-label="בחירת יום במפה"
                    value={mapDay}
                    onChange={(e) => setMapDay(+e.target.value)}
                  >
                    <option value={-1}>כל הטיול</option>
                    {trip.days.map((_, i) => (
                      <option key={i} value={i}>
                        {dateLabel(trip.start, i, true)}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {mapped.filter((s) => s.lat !== null && s.category !== 'transfer').length} מקומות
                  מסומנים
                </span>
                <button className="button secondary" onClick={() => setModal({ type: 'stop' })}>
                  <Plus size={16} />
                  הוספת מקום
                </button>
              </div>
              <div className="full-map-grid">
                <TripMap
                  large
                  stops={mapped}
                  onSelect={(s) => setModal({ type: 'stop', value: s })}
                />
                <div className="map-place-list">
                  {mapped
                    .filter((s) => s.category !== 'transfer')
                    .map((s, i) => (
                      <button key={s.id} onClick={() => setModal({ type: 'stop', value: s })}>
                        <span className={'place-number ' + (s.lat === null ? 'unlocated' : '')}>
                          {pinNumbers.get(s.id) || '?'}
                        </span>
                        <span>
                          <small>
                            {dateLabel(trip.start, s.day)} · {s.time || 'שעה פתוחה'}
                          </small>
                          <strong>{s.title}</strong>
                          <span>{s.location || 'המיקום המדויק עדיין פתוח'}</span>
                        </span>
                        <ChevronLeft size={15} />
                      </button>
                    ))}
                </div>
              </div>
              <p className="help-text">
                <Info size={14} />
                רק מקומות עם מיקום מזוהה מסומנים במפה. חיפוש וניווט זמינים גם מתוך כל עצירה.
              </p>
            </>
          )}
          {tab === 'bookings' && (
            <>
              <PageHeading
                eyebrow="הפרטים שעושים סדר"
                title="ההזמנות שלנו"
                description="טיסות, הבית ברומא, והמסמכים שנרצה בשלוף."
                action={
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'booking', kind: 'other' })}
                  >
                    <Plus size={17} />
                    הוספת הזמנה
                  </button>
                }
              />
              <div className="section-line">
                <Plane size={19} />
                <h2>הדרך לשם, והביתה</h2>
                <span>לפי כרטיסי הטיסה שצירפתם</span>
              </div>
              <div className="flights-grid">
                {trip.bookings
                  .filter((b) => b.type === 'flight')
                  .map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      onEdit={() => setModal({ type: 'booking', value: b })}
                      onCopy={copy}
                    />
                  ))}
              </div>
              {!trip.bookings.some((b) => b.type === 'flight') && (
                <Empty
                  icon={Plane}
                  title="מוסיפים את הטיסה"
                  text="השעות, השדות ופרטי ההזמנה במקום אחד."
                  action={
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: 'booking', kind: 'flight' })}
                    >
                      הוספת טיסה
                    </button>
                  }
                />
              )}
              <div className="section-line">
                <House size={19} />
                <h2>המקום שלנו</h2>
              </div>
              <div className="stays-grid">
                {trip.bookings
                  .filter((b) => b.type !== 'flight')
                  .map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      onEdit={() => setModal({ type: 'booking', value: b })}
                      onCopy={copy}
                    />
                  ))}
              </div>
              <div className="section-line">
                <FileText size={19} />
                <h2>המסמכים שלנו</h2>
                <span>קבצים אישיים, במכשיר הזה בלבד</span>
              </div>
              <div className="document-grid">
                {documents.map(({ id, label }) => (
                  <article className="document-card" key={id}>
                    <FileText size={25} />
                    <strong>{label}</strong>
                    <small>{docs[id] ? 'PDF · שמור במכשיר הזה' : 'PDF · להוספה למכשיר'}</small>
                    <div>
                      {docs[id] && (
                        <button
                          className="text-button"
                          onClick={() => viewDocument(id)}
                        >
                          פתיחת המסמך
                          <ArrowUpLeft size={14} />
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={!!uploading}
                        onClick={() => {
                          uploadKind.current = id;
                          uploadRef.current?.click();
                        }}
                      >
                        {uploading === id ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                        {docs[id] ? 'החלפה' : 'הוספת קובץ'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <p className="help-text">
                <ShieldCheck size={14} />
                קובצי PDF נשמרים רק בדפדפן הזה. הם אינם מתפרסמים באתר ואינם נכללים בקישור השיתוף או בגיבוי התוכנית.
              </p>
            </>
          )}
          {tab === 'essentials' && (
            <>
              <PageHeading
                eyebrow="לפני שיוצאים, ותוך כדי"
                title="הדברים הקטנים"
                description="פחות דברים בראש. יותר מקום לטיול."
              />
              <div className="essentials-grid">
                <div>
                  {(['before', 'packing'] as const).map((group) => {
                    const items = trip.checks.filter((c) => c.group === group),
                      done = items.filter((c) => c.done).length;
                    return (
                      <section className="checklist-card" key={group}>
                        <div className="aside-heading">
                          <h2>{group === 'before' ? 'עוד רגע יוצאים' : 'בתוך המזוודה'}</h2>
                          <span className="check-count">
                            {done}/{items.length}
                          </span>
                        </div>
                        <div className="progress-track">
                          <span
                            style={{
                              width: items.length ? (done / items.length) * 100 + '%' : '0%',
                            }}
                          />
                        </div>
                        {items.map((c) => (
                          <div className="checklist-item" key={c.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={c.done}
                                onChange={(e) =>
                                  act({
                                    id: uid(),
                                    type: 'check',
                                    value: { ...c, done: e.target.checked },
                                  })
                                }
                              />
                              <span className="custom-check">
                                <Check size={13} />
                              </span>
                              <span className={c.done ? 'struck' : ''}>{c.text}</span>
                            </label>
                            <button
                              className="icon-button small"
                              aria-label={'מחיקת ' + c.text}
                              onClick={() => act({ id: uid(), type: 'deleteCheck', value: c.id })}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="text-button checklist-add"
                          onClick={() => setModal({ type: 'check', group })}
                        >
                          <Plus size={16} />
                          עוד דבר קטן
                        </button>
                      </section>
                    );
                  })}
                </div>
                <div>
                  <section className="aside-card essentials-notes">
                    <div className="aside-heading">
                      <h2>הפתק שלנו</h2>
                      <NotebookPen size={20} />
                    </div>
                    <p className={trip.notes ? 'saved-note' : ''}>
                      {trip.notes || 'מסעדות ששמענו עליהן, דברים לזכור ורעיונות שעוד לא מצאו יום.'}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: 'notes' })}
                    >
                      <Pencil size={15} />
                      {trip.notes ? 'עריכת הפתק' : 'כותבים משהו'}
                    </button>
                  </section>
                  <section className="insurance-card">
                    <div className="aside-heading">
                      <h2>ביטוח, שיהיה בשלוף</h2>
                      <ShieldCheck size={21} />
                    </div>
                    <p>האישורים האישיים נשמרים רק במכשיר שמוסיפים אליו.</p>
                    <div className="insurance-dates">
                      <CalendarDays size={16} />
                      <strong>חוזרים ב־24 בנובמבר</strong>
                      <span>נחיתה אחרי חצות</span>
                    </div>
                    <div className="insurance-links">
                      <button className="text-button" onClick={() => changeTab('bookings')}>
                        למסמכים במכשיר הזה
                        <ArrowUpLeft size={14} />
                      </button>
                    </div>
                    <div className="insurance-date-note">
                      <Info size={15} />
                      <p>
                        הנחיתה בישראל ב־24.11, אחרי חצות. כדאי לוודא שתאריכי הביטוח מתאימים לכל הנסיעה.
                      </p>
                    </div>
                  </section>
                  <section className="aside-card useful-card">
                    <h2>כשצריך, בלי לחפש</h2>
                    {stay?.address && (
                      <a href={mapUrl(stay.address)} target="_blank" rel="noreferrer">
                        <House size={18} />
                        <span>
                          <strong>בחזרה לחדר</strong>
                          <small>
                            <bdi>{stay.address}</bdi>
                          </small>
                        </span>
                        <ArrowUpLeft size={16} />
                      </a>
                    )}
                    {stay?.phone && (
                      <a href={'tel:' + stay.phone}>
                        <Phone size={18} />
                        <span>
                          <strong>לדבר עם מקום האירוח</strong>
                          <small dir="ltr">{stay.phone}</small>
                        </span>
                        <ArrowUpLeft size={16} />
                      </a>
                    )}
                    <a href="https://myisrair.israir.co.il/" target="_blank" rel="noreferrer">
                      <Plane size={18} />
                      <span>
                        <strong>ניהול טיסה וצ׳ק־אין</strong>
                        <small>לאזור האישי של ישראייר</small>
                      </span>
                      <ArrowUpLeft size={16} />
                    </a>
                  </section>
                  <div className="backup-card">
                    <Download size={22} />
                    <h3>הטיול, גם אצלנו בכיס</h3>
                    <p>גיבוי התוכנית כקובץ, והורדת העצירות עם שעות ליומן.</p>
                    <div>
                      <button className="text-button" onClick={exportTrip}>
                        הורדת גיבוי
                        <ArrowDownToLine size={14} />
                      </button>
                      <button className="text-button" onClick={exportCalendar}>
                        הוספה ליומן
                        <CalendarDays size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <footer className="footer">
            <span dir="ltr">andiamo.</span>
            <p dir="ltr">JUST US, IN ROMA.</p>
            <span dir="ltr">18—23.11.26</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="ניווט ראשי בנייד">
        {nav.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? 'active' : ''}
            aria-current={tab === n.id ? 'page' : undefined}
            onClick={() => changeTab(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <input
        hidden
        ref={uploadRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="העלאת מסמך PDF"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <input
        hidden
        ref={importRef}
        type="file"
        accept="application/json,.json"
        aria-label="שחזור מגיבוי"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importTrip(f);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {toast}
          <button aria-label="סגירת ההודעה" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal?.type === 'stop' && (
        <StopSheet
          stop={modal.value ? trip.stops.find(s => s.id === modal.value?.id) || modal.value : undefined}
          startEditing={modal.edit}
          day={day}
          trip={trip}
          onClose={() => setModal(null)}
          onCopy={copy}
          onDone={stop => act({ id: uid(), type: 'done', value: { id: stop.id, done: !stop.done } })}
          onSave={(value) => {
            act({ id: uid(), type: 'stop', value });
            setModal({ type: 'stop', value });
            notify('העצירה נשמרה בתוכנית');
          }}
          onMove={(value) => {
            act({ id: uid(), type: 'move', value });
            notify('סדר העצירות עודכן');
          }}
          onDelete={(stop) => setModal({ type: 'delete', kind: 'stop', id: stop.id, title: stop.title })}
        />
      )}
      {modal?.type === 'booking' && (
        <BookingForm
          booking={modal.value}
          kind={modal.kind}
          onClose={() => setModal(null)}
          onSave={(value) => {
            act({ id: uid(), type: 'booking', value });
            setModal(null);
            notify('פרטי ההזמנה נשמרו');
          }}
          onDelete={(b) => setModal({ type: 'delete', kind: 'booking', id: b.id, title: b.title })}
        />
      )}
      {modal?.type === 'day' && (
        <SimpleForm
          title="היום הזה, כמו שמתאים לנו"
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            act({
              id: uid(),
              type: 'day',
              value: { day, title: String(f.get('title')).trim(), notes: String(f.get('notes')) },
            });
            setModal(null);
            notify('התוכנית של היום עודכנה');
          }}
        >
          <Field label="שם היום">
            <input name="title" defaultValue={trip.days[day]} required maxLength={300} />
          </Field>
          <Field label="מחשבות, תוכניות וכל מה שעוד פתוח">
            <textarea name="notes" rows={5} defaultValue={trip.dayNotes[day]} maxLength={12000} />
          </Field>
        </SimpleForm>
      )}
      {modal?.type === 'notes' && (
        <SimpleForm
          title="משהו לזכור יחד"
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            act({ id: uid(), type: 'notes', value: String(f.get('notes')) });
            setModal(null);
            notify('הפתק שלנו נשמר');
          }}
        >
          <Field label="הפתק שלנו">
            <textarea
              name="notes"
              rows={9}
              maxLength={12000}
              defaultValue={trip.notes}
              placeholder="שם של מסעדה, רעיון קטן, המלצה ממישהו שפגשנו…"
            />
          </Field>
        </SimpleForm>
      )}
      {modal?.type === 'check' && (
        <SimpleForm
          title="עוד דבר קטן"
          onClose={() => setModal(null)}
          onSubmit={(f) => {
            act({
              id: uid(),
              type: 'check',
              value: {
                id: uid(),
                text: String(f.get('text')).trim(),
                done: false,
                group: modal.group,
              },
            });
            setModal(null);
          }}
        >
          <Field label="מה לזכור?">
            <input name="text" required maxLength={300} placeholder="למשל, מתאם חשמל" />
          </Field>
        </SimpleForm>
      )}
      {modal?.type === 'delete' && (
        <Dialog title="להוציא מהתוכנית?" onClose={() => setModal(null)}>
          <p className="modal-copy">״{modal.title}״ יימחק מהטיול. שאר התוכנית תישאר כמו שהיא.</p>
          <div className="form-actions">
            <button
              className="button danger"
              onClick={() => {
                act({
                  id: uid(),
                  type: modal.kind === 'stop' ? 'deleteStop' : 'deleteBooking',
                  value: modal.id,
                });
                setModal(null);
                notify('הפריט נמחק מהתוכנית');
              }}
            >
              <Trash2 size={15} />
              מחיקה
            </button>
            <button className="button secondary" onClick={() => setModal(null)}>
              נשאיר אותו
            </button>
          </div>
        </Dialog>
      )}
      {modal?.type === 'share' && (
        <Dialog title="התוכנית שלנו, בקישור אחד" eyebrow="PASS IT ON" onClose={() => setModal(null)}>
          <p className="share-description">הקישור מכיל עותק של התוכנית, ההזמנות, ההערות והרשימות כפי שהן עכשיו. קובצי PDF נשארים במכשיר.</p>
          <Field label="הקישור לתוכנית המעודכנת" wide>
            <input className="share-url" dir="ltr" readOnly value={shareUrl} onFocus={e => e.target.select()} />
          </Field>
          <div className="form-actions">
            <button className="button primary" onClick={() => copy(shareUrl)}><Share2 size={16} />העתקת הקישור</button>
            {typeof navigator.share === 'function' && <button className="button secondary" onClick={() => navigator.share({ title: 'Andiamo · התוכנית שלנו לרומא', url: shareUrl }).catch(() => {})}>שליחה…</button>}
          </div>
          <p className="help-text">כל מי שמקבל את הקישור יכול לקרוא את הפרטים שבתוכו. העריכות הבאות לא יופיעו בקישור הזה — משתפים שוב כשמעדכנים.</p>
        </Dialog>
      )}
      {modal?.type === 'sharedTrip' && (
        <Dialog title="הגיעה תוכנית מעודכנת" eyebrow="CIAO, US" onClose={() => { setModal(null); history.replaceState(null, '', '#plan'); }}>
          <p className="share-description">{modal.value.stops.length} עצירות, {modal.value.bookings.length} הזמנות ושישה ימים ברומא. קבלת התוכנית תחליף את התוכנית השמורה במכשיר הזה. מסמכי PDF אישיים יישארו כאן.</p>
          <p className="help-text">כדי לשמור גם את העריכות שלכם, אפשר להוריד גיבוי לפני ההחלפה.</p>
          <div className="form-actions">
            <button className="button primary" onClick={() => { act({ id: uid(), type: 'restore', value: modal.value }); setModal(null); history.replaceState(null, '', '#plan'); notify('התוכנית המעודכנת נשמרה במכשיר'); }}><Check size={16} />קבלת התוכנית</button>
            <button className="button secondary" onClick={exportTrip}>גיבוי התוכנית הנוכחית</button>
          </div>
        </Dialog>
      )}
      {modal?.type === 'settings' && (
        <Dialog
          title="הטיול שלנו, מסודר"
          eyebrow="ANDIAMO · SHALEV & MIA"
          onClose={() => setModal(null)}
        >
          <div className="settings-trip">
            <CalendarDays size={21} />
            <div>
              <strong>רומא · 18–23 בנובמבר 2026</strong>
              <p>6 ימים · 5 לילות · אנחנו</p>
            </div>
          </div>
          <div className="settings-actions">
            <button onClick={shareTrip}>
              <Share2 size={19} />
              <span>
                <strong>שיתוף התוכנית המעודכנת</strong>
                <small>קישור עם התוכנית כפי שהיא עכשיו, ללא קובצי PDF</small>
              </span>
              <ChevronLeft size={16} />
            </button>
            <button onClick={exportTrip}>
              <ArrowDownToLine size={19} />
              <span>
                <strong>הורדת גיבוי</strong>
                <small>התוכנית, ההזמנות והרשימות כקובץ JSON</small>
              </span>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => importRef.current?.click()}>
              <ArrowUpFromLine size={19} />
              <span>
                <strong>שחזור מגיבוי</strong>
                <small>החלפת פרטי הטיול מתוך קובץ שגיביתם</small>
              </span>
              <ChevronLeft size={16} />
            </button>
            <button onClick={exportCalendar}>
              <CalendarDays size={19} />
              <span>
                <strong>הורדה ליומן</strong>
                <small>עצירות עם שעה שנקבעה · לפי שעון רומא</small>
              </span>
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="settings-note">
            <ShieldCheck size={18} />
            <p>
              האתר פתוח לצפייה. העריכות והמסמכים האישיים נשמרים במכשיר הזה בלבד. כדי להעביר
              שינויים בינינו, שולחים קישור מעודכן או קובץ גיבוי. אין סנכרון אוטומטי בין מכשירים.
            </p>
          </div>
          <p className="install-note">
            כדי לשמור את הטיול קרוב: בתפריט הדפדפן בטלפון, בחרו ״הוספה למסך הבית״. כדי למחוק את
            העותק מהמכשיר, מחקו את נתוני האתר בדפדפן.
          </p>
        </Dialog>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function SimpleForm({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (f: FormData) => void;
  children: ReactNode;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <div className="simple-fields">{children}</div>
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={16} />
            שמירה
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function StopSheet({ stop, startEditing, day, trip, onClose, onSave, onDelete, onMove, onDone, onCopy }: {
  stop?: Stop;
  startEditing?: boolean;
  day: number;
  trip: Trip;
  onClose: () => void;
  onSave: (stop: Stop) => void;
  onDelete: (stop: Stop) => void;
  onMove: (value: { id: string; direction: 'up' | 'down' }) => void;
  onDone: (stop: Stop) => void;
  onCopy: (value: string) => void;
}) {
  const [editing, setEditing] = useState(startEditing || !stop);
  const body = useRef<HTMLDivElement>(null);
  const showDetails = () => {
    setEditing(false);
    body.current?.closest('.dialog-body')?.scrollTo({ top: 0 });
  };
  const showEditor = () => {
    setEditing(true);
    body.current?.closest('.dialog-body')?.scrollTo({ top: 0 });
  };
  return (
    <Dialog
      title={editing ? (stop ? 'עריכת העצירה' : 'מוסיפים רגע לטיול') : stop!.title}
      eyebrow={editing ? (stop?.title || 'מה מתחשק לנו לעשות?') : categories[stop!.category]}
      onClose={onClose}
      onBack={editing && stop ? showDetails : undefined}
    >
      <div ref={body} className="stop-sheet-content" key={editing ? 'edit' : 'view'}>
        {editing ? <StopForm stop={stop} day={day} trip={trip}
          onClose={stop ? showDetails : onClose}
          onSave={value => { onSave(value); showDetails(); }}
          onDelete={onDelete} onMove={onMove} />
        : stop && <StopDetails stop={stop} trip={trip} onEdit={showEditor} onDone={() => onDone(stop)} onCopy={onCopy} />}
      </div>
    </Dialog>
  );
}
function StopForm({
  stop,
  day,
  trip,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  stop?: Stop;
  day: number;
  trip: Trip;
  onClose: () => void;
  onSave: (s: Stop) => void;
  onDelete: (s: Stop) => void;
  onMove: (s: { id: string; direction: 'up' | 'down' }) => void;
}) {
  const [error, setError] = useState('');
  const [loc, setLoc] = useState(stop?.location || '');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (n: string) => String(f.get(n) || '').trim();
    const unchanged = loc === stop?.location;
    const coordinateEdit =
      get('lat') !== String(stop?.lat ?? '') || get('lng') !== String(stop?.lng ?? '');
    const keepCoordinates = unchanged || coordinateEdit;
    const targetDay = Number(get('day'));
    const value = {
      id: stop?.id || uid(),
      order:
        stop && stop.day === targetDay
          ? trip.stops.find((s) => s.id === stop.id)?.order ?? stop.order
          : Math.max(-1, ...trip.stops.filter((s) => s.day === targetDay).map((s) => s.order)) + 1,
      day: targetDay,
      title: get('title'),
      zone: get('zone') || 'Europe/Rome',
      time: get('time'),
      duration: get('duration'),
      category: get('category'),
      location: loc.trim(),
      notes: get('notes'),
      url: get('url'),
      reference: get('reference'),
      lat: keepCoordinates && get('lat') ? Number(get('lat')) : null,
      lng: keepCoordinates && get('lng') ? Number(get('lng')) : null,
      done: stop?.done || false,
      status: get('status'),
    };
    const r = stopSchema.safeParse(value);
    if ((value.lat === null) !== (value.lng === null)) {
      setError('כדי להציג סיכה במפה, יש להזין גם קו רוחב וגם קו אורך.');
      return;
    }
    if (!r.success) {
      setError('כדאי לבדוק את הפרטים. קישורים צריכים להתחיל ב־https://, וקואורדינטות הן מספרים.');
      return;
    }
    onSave(r.data);
  };
  const Icon = icons[stop?.category || 'sight'];
  return (
    <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="שם המקום או התוכנית" wide>
            <input
              name="title"
              defaultValue={stop?.title}
              placeholder="למשל, קפה קטן ליד המלון"
              required
              maxLength={300}
            />
          </Field>
          <Field label="באיזה יום?">
            <select name="day" defaultValue={stop?.day ?? day}>
              {trip.days.map((_, i) => (
                <option key={i} value={i}>
                  {dateLabel(trip.start, i, true)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="אזור הזמן של השעה">
            <select name="zone" defaultValue={stop?.zone || 'Europe/Rome'}>
              <option value="Europe/Rome">רומא</option>
              <option value="Asia/Jerusalem">ישראל · למשל בטיסת ההלוך</option>
            </select>
          </Field>
          <Field label="סוג העצירה">
            <select name="category" defaultValue={stop?.category || 'sight'}>
              {Object.entries(categories).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="שעה · אפשר להשאיר פתוח">
            <input type="time" name="time" defaultValue={stop?.time} />
          </Field>
          <Field label="כמה זמן? · לא חובה">
            <input
              name="duration"
              maxLength={300}
              defaultValue={stop?.duration}
              placeholder="שעה, או כמה שמתחשק"
            />
          </Field>
          <Field label="כתובת או שם לחיפוש במפות" wide>
            <div className="input-with-action">
              <input
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                maxLength={300}
                placeholder="שם המקום באנגלית עוזר למצוא אותו"
              />
              {loc && (
                <a
                  href={mapUrl(loc)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="חיפוש המקום במפות"
                >
                  <Navigation size={16} />
                </a>
              )}
            </div>
          </Field>
          <Field label="איפה זה עומד?">
            <select name="status" defaultValue={stop?.status || 'draft'}>
              {Object.entries(statuses).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מספר הזמנה · אם יש">
            <input name="reference" dir="auto" defaultValue={stop?.reference} maxLength={300} />
          </Field>
          <Field label="מה כדאי לזכור?" wide>
            <textarea
              rows={4}
              name="notes"
              maxLength={12000}
              defaultValue={stop?.notes}
              placeholder="המלצה של מיה, משהו שצריך להזמין, או סתם רעיון…"
            />
          </Field>
          <Field label="קישור להזמנה או לאתר הרשמי" wide>
            <input
              type="url"
              dir="ltr"
              name="url"
              maxLength={2000}
              defaultValue={stop?.url}
              placeholder="https://"
            />
          </Field>
        </div>
        {stop && (
          <div className="reorder-actions">
            <span>סדר העצירות ביום</span>
            <button
              type="button"
              className="text-button"
              onClick={() => onMove({ id: stop.id, direction: 'up' })}
            >
              <ArrowUp size={14} />
              למעלה
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onMove({ id: stop.id, direction: 'down' })}
            >
              <ArrowDown size={14} />
              למטה
            </button>
          </div>
        )}
        <details className="coordinate-details">
          <summary>סיכה מדויקת במפה · לא חובה</summary>
          <p>ניווט עובד לפי השם גם בלי סיכה. להוספת סיכה, אפשר להעתיק קווי רוחב ואורך ממפות.</p>
          <div className="form-grid">
            <Field label="קו רוחב">
              <input
                name="lat"
                type="number"
                step="any"
                min={-90}
                max={90}
                defaultValue={stop?.lat ?? ''}
              />
            </Field>
            <Field label="קו אורך">
              <input
                name="lng"
                type="number"
                step="any"
                min={-180}
                max={180}
                defaultValue={stop?.lng ?? ''}
              />
            </Field>
          </div>
        </details>
        {stop?.location && (
          <a
            className="button navigation-button"
            href={mapUrl(stop.location)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={16} />
            לניווט למקום
            <ArrowUpLeft size={15} />
          </a>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={16} />
            שמירת העצירה
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            ביטול
          </button>
          {stop && (
            <button
              className="icon-button delete-action"
              type="button"
              aria-label="מחיקת העצירה"
              onClick={() => onDelete(stop)}
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
    </form>
  );
}
function BookingForm({
  booking: b,
  kind,
  onClose,
  onSave,
  onDelete,
}: {
  booking?: Booking;
  kind?: Booking['type'];
  onClose: () => void;
  onSave: (b: Booking) => void;
  onDelete: (b: Booking) => void;
}) {
  const [type, setType] = useState<Booking['type']>(b?.type || kind || 'other'),
    [error, setError] = useState('');
  const flight = type === 'flight';
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      get = (n: string) => String(f.get(n) || '').trim();
    const r = bookingSchema.safeParse({
      id: b?.id || uid(),
      type,
      title: get('title'),
      date: get('date'),
      endDate: get('endDate'),
      time: get('time'),
      endTime: get('endTime'),
      from: get('from'),
      to: get('to'),
      number: get('number'),
      reference: get('reference'),
      address: get('address'),
      phone: get('phone'),
      notes: get('notes'),
      url: get('url'),
      status: get('status'),
    });
    if (!r.success) {
      setError('בדקו את הפרטים ואת הקישור. קישור מלא מתחיל ב־https://');
      return;
    }
    if (r.data.date && r.data.endDate && r.data.endDate < r.data.date) {
      setError('תאריך הסיום צריך להיות ביום ההתחלה או אחריו');
      return;
    }
    onSave(r.data);
  };
  return (
    <Dialog
      title={b ? 'פרטי ההזמנה' : 'עוד משהו שסגרנו'}
      eyebrow="כל הפרטים בהישג יד"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="סוג הזמנה">
            <select value={type} onChange={(e) => setType(e.target.value as Booking['type'])}>
              <option value="flight">טיסה</option>
              <option value="stay">לינה</option>
              <option value="other">מסעדה, כרטיס או הזמנה אחרת</option>
            </select>
          </Field>
          <Field label="מצב ההזמנה">
            <select name="status" defaultValue={b?.status || 'planned'}>
              <option value="planned">בתכנון</option>
              <option value="reserved">הזמנה מאושרת</option>
              {flight && <option value="checked-in">בוצע צ׳ק־אין</option>}
            </select>
          </Field>
          <Field label="שם ההזמנה" wide>
            <input
              name="title"
              defaultValue={b?.title}
              required
              maxLength={300}
              placeholder={flight ? 'טסים לרומא' : 'שם מקום האירוח או ההזמנה'}
            />
          </Field>
          {flight && (
            <>
              <Field label="משדה התעופה">
                <input
                  dir="ltr"
                  name="from"
                  maxLength={300}
                  defaultValue={b?.from}
                  placeholder="TLV"
                />
              </Field>
              <Field label="אל שדה התעופה">
                <input dir="ltr" name="to" maxLength={300} defaultValue={b?.to} placeholder="FCO" />
              </Field>
              <Field label="מספר הטיסה" wide>
                <input
                  name="number"
                  dir="ltr"
                  maxLength={300}
                  defaultValue={b?.number}
                  placeholder="6H343"
                />
              </Field>
            </>
          )}
          <Field label={flight ? 'תאריך המראה' : 'תאריך התחלה'}>
            <input type="date" name="date" defaultValue={b?.date || '2026-11-18'} />
          </Field>
          <Field label={flight ? 'תאריך נחיתה · לבדוק אם למחרת' : 'תאריך סיום'}>
            <input type="date" name="endDate" defaultValue={b?.endDate || '2026-11-18'} />
          </Field>
          <Field label={flight ? 'שעת המראה · מקומית' : 'שעת התחלה'}>
            <input type="time" name="time" defaultValue={b?.time} />
          </Field>
          <Field label={flight ? 'שעת נחיתה · מקומית' : 'שעת סיום'}>
            <input type="time" name="endTime" defaultValue={b?.endTime} />
          </Field>
          <Field label="מספר הזמנה">
            <input name="reference" dir="auto" defaultValue={b?.reference} maxLength={300} />
          </Field>
          <Field label="טלפון ליצירת קשר">
            <input type="tel" dir="ltr" name="phone" defaultValue={b?.phone} maxLength={300} />
          </Field>
          <Field label="כתובת" wide>
            <input name="address" dir="auto" defaultValue={b?.address} maxLength={300} />
          </Field>
          <Field label="מה כדאי לזכור?" wide>
            <textarea name="notes" rows={4} defaultValue={b?.notes} maxLength={12000} />
          </Field>
          <Field label="קישור לניהול ההזמנה" wide>
            <input
              type="url"
              dir="ltr"
              name="url"
              defaultValue={b?.url}
              maxLength={2000}
              placeholder="https://"
            />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={16} />
            שמירת ההזמנה
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            ביטול
          </button>
          {b && (
            <button
              className="icon-button delete-action"
              type="button"
              aria-label="מחיקת ההזמנה"
              onClick={() => onDelete(b)}
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
