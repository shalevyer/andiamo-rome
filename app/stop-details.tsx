import { CalendarDays, Check, CheckCheck, Clock3, ExternalLink, MapPin, Navigation, Pencil, Ticket } from 'lucide-react';
import { dateLabel, mapUrl, statuses, type Stop, type Trip } from './model';

export default function StopDetails({ stop, trip, onEdit, onDone, onCopy }: {
  stop: Stop;
  trip: Trip;
  onEdit: () => void;
  onDone: () => void;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="stop-details">
      <div className="detail-meta">
        <span className={'badge ' + stop.status}>{statuses[stop.status]}</span>
        {stop.done && <span className="detail-done"><CheckCheck size={15} />כבר היינו כאן</span>}
      </div>
      <div className="detail-when">
        <div><CalendarDays size={19} /><span><strong>{dateLabel(trip.start, stop.day, true)}</strong><small>{trip.days[stop.day]}</small></span></div>
        <div><Clock3 size={19} /><span><strong dir={stop.time ? 'ltr' : undefined}>{stop.time || 'השעה עוד פתוחה'}</strong><small>{stop.time ? (stop.zone === 'Asia/Jerusalem' ? 'שעון ישראל' : 'שעון רומא') : 'בקצב שלנו'}{stop.duration ? ' · ' + stop.duration : ''}</small></span></div>
      </div>
      {stop.location && <div className="detail-location"><MapPin size={19} /><div><span>איפה נפגשים</span><p><bdi>{stop.location}</bdi></p></div></div>}
      {stop.notes && <section className="detail-notes"><h3>מה כדאי לזכור</h3><p>{stop.notes}</p></section>}
      {stop.reference && <button type="button" className="detail-reference" onClick={() => onCopy(stop.reference)}><Ticket size={18} /><span>מספר הזמנה<strong dir="auto">{stop.reference}</strong></span><small>העתקה</small></button>}
      {stop.url && <a className="text-button detail-link" href={stop.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />לאתר או להזמנה</a>}
      <div className="detail-actions">
        {stop.location && <a className="button primary" href={mapUrl(stop.location)} target="_blank" rel="noreferrer"><Navigation size={17} />לניווט למקום</a>}
        <button type="button" className={'button ' + (stop.location ? 'secondary' : 'primary')} onClick={onEdit}><Pencil size={16} />עריכת העצירה</button>
      </div>
      <button type="button" className={'detail-completion' + (stop.done ? ' is-done' : '')} aria-pressed={stop.done} onClick={onDone}><span><Check size={16} /></span>{stop.done ? 'העצירה בוצעה · ביטול הסימון' : 'סימון העצירה כבוצעה'}</button>
    </div>
  );
}
