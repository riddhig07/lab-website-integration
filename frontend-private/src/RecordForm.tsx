import { useState, type FormEvent } from 'react';
import type { FieldDef, ResourceDef } from './types';

export type FormValue = string | number | boolean;
export type Row = Record<string, unknown> & { id?: number };

function initialValue(field: FieldDef, row: Row | null): FormValue {
  const existing = row?.[field.name];
  if (existing !== undefined && existing !== null) return existing as FormValue;
  if (field.default !== undefined) return field.default;
  if (field.type === 'boolean') return false;
  if (field.type === 'date') return new Date().toISOString().slice(0, 10);
  return '';
}

interface Props {
  def: ResourceDef;
  row: Row | null; // null = creating a new record
  onSubmit: (values: Record<string, FormValue>) => Promise<void>;
  onCancel: () => void;
}

export function RecordForm({ def, row, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, FormValue>>(() =>
    Object.fromEntries(def.fields.map((f) => [f.name, initialValue(f, row)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (name: string, value: FormValue) => setValues((v) => ({ ...v, [name]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="record-form" onSubmit={handleSubmit}>
      <h2>{row ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`}</h2>
      {def.fields.map((field) => (
        <Field key={field.name} field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} />
      ))}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ field, value, onChange }: { field: FieldDef; value: FormValue; onChange: (v: FormValue) => void }) {
  const id = `field-${field.name}`;

  if (field.type === 'boolean') {
    return (
      <label className="checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  let input;
  if (field.type === 'textarea') {
    input = (
      <textarea id={id} rows={5} required={field.required} value={String(value)} onChange={(e) => onChange(e.target.value)} />
    );
  } else if (field.type === 'select') {
    input = (
      <select id={id} required={field.required} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>
            {field.optionLabels?.[opt] ?? opt}
          </option>
        ))}
      </select>
    );
  } else {
    input = (
      <input
        id={id}
        type={field.type === 'url' ? 'text' : field.type}
        required={field.required}
        value={String(value)}
        placeholder={field.type === 'url' ? 'https://…' : undefined}
        onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      />
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="required"> *</span>}
      </label>
      {input}
      {field.help && <div className="muted small">{field.help}</div>}
    </div>
  );
}
