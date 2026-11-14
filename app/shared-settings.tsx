import { useEffect, useState } from 'react';
import { Check, Cloud, Download, Link2, RefreshCw } from 'lucide-react';
import Dialog from './dialog';
import { acceptInvitation, cloudRequest, invitationLink } from './connection';
import { resolveConflict, updateSyncState, type SyncState } from './cloud-sync';
import { documents, openDocument } from './documents';

const save = (name: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const display = (value: unknown) => value === null ? 'הפריט לא קיים בטיול המשותף' : typeof value === 'string' ? value || 'ללא תוכן' : typeof value === 'boolean' ? value ? 'בוצע' : 'לא בוצע' : typeof value === 'object' && value && 'title' in value ? String(value.title) : JSON.stringify(value);
const fields: Record<string, string> = { title: 'שם', notes: 'הערות', time: 'שעה', day: 'יום', location: 'מיקום', done: 'סימון ביצוע', order: 'סדר בתוכנית', reference: 'מספר הזמנה', text: 'פריט ברשימה', start: 'תאריכי הטיול', days: 'שם היום', dayNotes: 'הערות היום' };

export default function SharedSettings({ connected, conflicts, retry, notify, onClose }: {
  connected: boolean; conflicts: SyncState['conflicts']; retry: () => unknown; notify: (text: string) => void; onClose: () => void;
}) {
  const [invitation, setInvitation] = useState('');
  const [history, setHistory] = useState<{ revision: number; created: string }[]>([]);
  const [files, setFiles] = useState<{ id: string; version: string; created: string }[]>([]);
  const [error, setError] = useState('');
  const run = (task: () => Promise<unknown>) => task().catch(e => setError(e instanceof Error ? e.message : 'החיבור לא הצליח'));
  useEffect(() => {
    if (connected) run(async () => {
      const response = await cloudRequest('/v1/history');
      if (!response.ok) throw Error('ההיסטוריה תופיע כשהחיבור יחזור');
      setHistory((await response.json() as { revisions: { revision: number; created: string }[] }).revisions);
    });
  }, [connected]);
  const when = (value: string) => new Date(value).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  return <Dialog title="הטיול שלנו, בכל מכשיר" eyebrow="TOGETHER IN ROMA" onClose={onClose}>
    <p className="share-description">{connected ? 'המכשיר מחובר לאותו טיול. שינויים בתוכנית, בהזמנות וברשימות מתעדכנים אצל שנינו, בדרך כלל בתוך כמה שניות.' : 'פותחים פעם אחת את קישור הטיול המשותף בכל מכשיר. כל מה שכבר הוספתם כאן יישמר ויתמזג עם הטיול.'}</p>
    {connected && <div className="shared-actions"><button className="button secondary" onClick={() => { retry(); notify('בודקים שהכול מעודכן'); }}><RefreshCw size={16} />עדכון עכשיו</button><button className="button primary" onClick={() => run(async () => { await navigator.clipboard.writeText(invitationLink()); notify('קישור הטיול הועתק. פותחים אותו גם במכשיר השני.'); })}><Link2 size={16} />העתקת קישור הטיול</button></div>}
    <details className="shared-section" open={!connected}>
      <summary>{connected ? 'חיבור מחדש עם קישור אחר' : 'יש לי קישור לטיול'}</summary>
      <form className="shared-join" onSubmit={event => { event.preventDefault(); try { acceptInvitation(invitation); setError(''); retry(); notify('מתחברים לטיול ושומרים את התוכנית שכבר הוספתם'); } catch (e) { setError(String(e)); } }}>
        <label className="field"><span>קישור הטיול שקיבלתם</span><input aria-label="קישור הטיול המשותף" type="text" dir="ltr" autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} required /></label>
        <button className="button primary" type="submit"><Cloud size={16} />חיבור לטיול</button>
      </form>
    </details>
    {conflicts.length > 0 && <section className="shared-section"><h3>יש כמה שינויים שדורשים בחירה</h3><p className="help-text">אותו פרט השתנה בשני מכשירים. שתי הגרסאות נשמרו; בוחרים מה יופיע בטיול.</p>{conflicts.map(conflict => <article className="sync-conflict" key={conflict.operation.id}>
      {conflict.details.map((detail, i) => <div key={i}><strong>{fields[detail.change.field || detail.change.id] || 'פרטי הטיול'}</strong><p>בטיול המשותף: {display(detail.current)}</p><p>במכשיר הזה: {display(detail.change.after)}</p></div>)}
      <div className="shared-actions"><button className="button secondary" onClick={() => run(async () => { await resolveConflict(conflict.operation.id, false); retry(); })}>השארת המשותף</button><button className="button primary" onClick={() => run(async () => { await resolveConflict(conflict.operation.id, true); retry(); })}><Check size={15} />שמירת השינוי שלי</button></div>
      <button className="text-button" onClick={() => save('andiamo-preserved-change.json', conflict)}>הורדת שתי הגרסאות</button>
    </article>)}</section>}
    {connected && <details className="shared-section"><summary>גיבויים והיסטוריית שינויים</summary>
      <p className="help-text">כל עדכון בטיול המשותף שומר גרסה קודמת. עדכוני עיצוב וקוד אינם מאפסים את התוכנית.</p>
      <button className="text-button" onClick={() => run(async () => { const state = await updateSyncState(); if (state.originalRaw === null) { notify('במכשיר הזה לא היה עותק קודם לחיבור'); return; } save('andiamo-before-shared-sync.json', state.originalRaw); })}><Download size={15} />העותק שהיה במכשיר לפני החיבור</button>
      <button className="text-button" onClick={() => run(async () => { const state = await updateSyncState(); save('andiamo-pending-changes.json', { pending: state.pending, conflicts: state.conflicts }); })}><Download size={15} />גיבוי שינויים שממתינים לסנכרון</button>
      <div className="revision-list">{history.map(version => <button key={version.revision} onClick={() => run(async () => { const response = await cloudRequest('/v1/history?revision=' + version.revision); if (!response.ok) throw Error('הגיבוי לא זמין כרגע'); save('andiamo-version-' + version.revision + '.json', await response.json()); })}><span>גרסה {version.revision}<small>{when(version.created)}</small></span><Download size={16} /></button>)}</div>
    </details>}
    {connected && <details className="shared-section"><summary>גרסאות קודמות של מסמכים</summary><div className="revision-list">{documents.map(doc => <button key={doc.id} onClick={() => run(async () => { const response = await cloudRequest('/v1/document-history?id=' + doc.id); if (!response.ok) throw Error('הגרסאות לא זמינות כרגע'); const data = await response.json() as { versions: { version: string; created: string }[] }; setFiles(data.versions.map(v => ({ ...v, id: doc.id }))); if (!data.versions.length) notify('למסמך הזה עדיין אין גרסאות משותפות'); })}>{doc.label}</button>)}</div>{files.map(file => <button className="text-button" key={file.version} onClick={() => run(() => openDocument(file.id, false, file.version))}>פתיחת הגרסה מ־{when(file.created)}</button>)}</details>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="help-text">קישור הטיול מאפשר לצפות ולערוך גם את המסמכים האישיים. משתפים אותו רק ביניכם.</p>
  </Dialog>;
}
