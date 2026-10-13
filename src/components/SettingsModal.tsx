import { useState } from 'react';
import type { NotifyPrefs } from '../api';
import type { Settings } from '../types';
import { Modal } from './Modal';
import { NotificationSettings } from './NotificationSettings';

interface Props {
  settings: Settings;
  notify: NotifyPrefs | null;
  onNotifyChange: (prefs: NotifyPrefs) => void;
  onSave: (s: Settings) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function SettingsModal({ settings, notify, onNotifyChange, onSave, onClearAll, onClose }: Props) {
  const [dueSoon, setDueSoon] = useState(settings.dueSoonMinutes);
  const [grace, setGrace] = useState(settings.graceMinutes);

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>Turn amber “due soon” <b>{dueSoon} min</b> before a dose</span>
          <input type="range" min={5} max={120} step={5} value={dueSoon} onChange={(e) => setDueSoon(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Auto-mark as missed <b>{grace} min</b> after the dose time</span>
          <input type="range" min={5} max={240} step={5} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
        </label>

        <NotificationSettings prefs={notify} onChange={onNotifyChange} />

        <div className="legend clay-inset">
          <span><i className="lg upcoming" /> Upcoming</span>
          <span><i className="lg due-soon" /> Due soon</span>
          <span><i className="lg due-now" /> Due now</span>
          <span><i className="lg taken" /> Taken</span>
          <span><i className="lg missed" /> Missed</span>
        </div>

        <div className="form-actions spread">
          <button
            type="button"
            className="clay-btn danger"
            onClick={() => confirm('Delete all medicines and history?') && onClearAll()}
          >
            Clear all data
          </button>
          <button
            type="button"
            className="clay-btn primary"
            onClick={() => onSave({ dueSoonMinutes: dueSoon, graceMinutes: grace })}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
