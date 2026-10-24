import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { api } from './api';
import type { ResourceDef } from './types';
import { useAuth } from './auth';
import { useDefinitions } from './Layout';
import { RecordForm, type FormValue, type Row } from './RecordForm';

/** /:key — looks up the content type and renders its management screen. */
export function ResourcePage() {
  const { key } = useParams();
  const def = useDefinitions().find((d) => d.key === key);
  if (!def) return <Navigate to="/" replace />;
  return <ResourceView key={def.key} def={def} />;
}

/** Generic list + create/edit/delete screen for any content type. */
function ResourceView({ def }: { def: ResourceDef }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined = form closed, null = creating, Row = editing
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);

  const base = `/internal/${def.key}`;

  const load = useCallback(() => {
    api<Row[]>(base)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [base]);

  useEffect(load, [load]);

  async function save(values: Record<string, FormValue>) {
    if (editing?.id) await api(`${base}/${editing.id}`, { method: 'PUT', body: values });
    else await api(base, { method: 'POST', body: values });
    setEditing(undefined);
    load();
  }

  async function remove(row: Row) {
    if (!confirm(`Delete "${String(row[def.listColumns[0]] ?? row.id)}"? This cannot be undone.`)) return;
    try {
      await api(`${base}/${row.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const fieldFor = (name: string) => def.fields.find((f) => f.name === name);

  function renderCell(row: Row, column: string) {
    const field = fieldFor(column);
    const value = row[column];
    if (field?.type === 'boolean') return value ? 'Yes' : 'No';
    if (field?.type === 'select' && typeof value === 'string') return field.optionLabels?.[value] ?? value;
    if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
    return String(value);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{def.label}</h1>
          <p className="muted">{def.description}</p>
        </div>
        {editing === undefined && <button onClick={() => setEditing(null)}>New {def.singular.toLowerCase()}</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {editing !== undefined && (
        <RecordForm key={editing?.id ?? 'new'} def={def} row={editing} onSubmit={save} onCancel={() => setEditing(undefined)} />
      )}

      {rows === null && !error && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <p className="muted">Nothing here yet.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {def.listColumns.map((c) => (
                  <th key={c}>{fieldFor(c)?.label ?? c}</th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {def.listColumns.map((c) => (
                    <td key={c}>{renderCell(row, c)}</td>
                  ))}
                  <td className="row-actions">
                    <button className="link" onClick={() => setEditing(row)}>
                      Edit
                    </button>
                    {user?.role === 'admin' && (
                      <button className="link danger" onClick={() => void remove(row)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
