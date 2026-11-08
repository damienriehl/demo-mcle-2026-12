import { Overlay } from '../components/Overlay';
import { dateLabel, type Selection } from '../views/shared';

export function VerifyDrawer({ selection, onClose, onOpenMatter }: { selection: Selection; onClose: () => void; onOpenMatter?: () => void }) {
  return <Overlay title="Trust but Verify" closeLabel="Close verification" onClose={onClose}>
    <p className="drawer-intro">Review the selected item.</p><h3>{selection.label}</h3>
    {selection.value && <p className="selected-value">{selection.value}</p>}
    {selection.result?.status === 'computed' ? <div className="verify-result"><p>Computed due date</p><strong>{dateLabel(selection.result.dueDate)}</strong></div>
      : <div className="verify-result"><p>Needs verification</p><strong>{selection.result?.reason ?? 'This fact has no computed due date.'}</strong></div>}
    <p>The full calculation and source review will appear here.</p>
    {onOpenMatter && <button className="primary-button" onClick={onOpenMatter}>Open matter</button>}
  </Overlay>;
}
