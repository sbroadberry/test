import React from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, daysUntil } from '../../api.js';
import { useAsync, Spinner, Empty, Badge } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Certificates() {
  const { data, loading } = useAsync(() => api.get('/api/certificates'));
  if (loading) return <Spinner />;
  return (
    <>
      <PageHead title="My certificates" sub="Download PDF certificates and keep an eye on expiry dates." />
      {data.certificates.length === 0 ? <div className="card"><Empty icon={Icons.award} title="No certificates yet">Complete a course to earn your first certificate.</Empty></div> : (
        <div className="card"><table className="table"><thead><tr><th>Course</th><th>Certificate ID</th><th>Issued</th><th>Expires</th><th></th></tr></thead><tbody>
          {data.certificates.map((c) => { const d = daysUntil(c.expires_at); return (<tr key={c.id} data-testid="certificate-row"><td className="strong">{c.course_title}<div className="tiny muted">{c.category}</div></td><td><code>{c.code}</code></td><td>{fmtDate(c.issued_at)}</td>
            <td>{c.expires_at ? <span className="row">{fmtDate(c.expires_at)} {d < 0 ? <Badge tone="red">Expired</Badge> : d <= 60 ? <Badge tone="amber">{d} days left</Badge> : null}</span> : <span className="muted">Never</span>}</td>
            <td className="actions"><a className="btn sm secondary" href={`/api/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer"><Icons.download />PDF</a>{d != null && d <= 60 && <Link className="btn sm" to={`/courses/${c.course_id}`}>Renew</Link>}</td></tr>); })}
        </tbody></table></div>)}
    </>
  );
}
