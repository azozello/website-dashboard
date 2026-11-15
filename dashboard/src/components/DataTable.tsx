import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  strong?: boolean;
  sort?: false;
  cell: (r: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  defKey: string;
  /** -1 = descending (default), 1 = ascending */
  defDir?: 1 | -1;
}

/** Sortable table. Clicking a header sorts descending, clicking again flips it. */
export function DataTable<T extends object>({ columns, rows, defKey, defDir = -1 }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: defKey, dir: defDir });

  const sorted = useMemo(() => {
    const val = (r: T) => (r as Record<string, unknown>)[sort.key];
    return rows.slice().sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(String(y), 'de') : (x as number) - (y as number);
      return sort.dir === -1 ? -c : c;
    });
  }, [rows, sort]);

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => {
              const on = c.key === sort.key;
              return (
                <th
                  key={c.key}
                  className={c.num ? 'n' : undefined}
                  aria-sort={on ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}
                >
                  {c.sort === false ? (
                    c.label
                  ) : (
                    <button onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : -1 }))}>
                      {c.label + (on ? (sort.dir === -1 ? ' ↓' : ' ↑') : '')}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={[c.num && 'n', c.strong && 'strong'].filter(Boolean).join(' ') || undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
