'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';

const JOB_STATUSES = ['Need to Submit', 'In Review', 'Approved', 'Approved and Printed', 'Complete'];
const TECHS = ['Tech 1', 'Tech 2', 'Tech 3'];

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [hoas, setHoas] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedHoaId, setSelectedHoaId] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('hoas'); // 'hoas' | 'jobs'
  const [jobsFilter, setJobsFilter] = useState('All');
  const [techFilter, setTechFilter] = useState('All');
  const [jobSearch, setJobSearch] = useState('');
  const [hoaModal, setHoaModal] = useState(null); // null closed, {} new, {...hoa} edit
  const [jobModal, setJobModal] = useState(null);
  const [csvMode, setCsvMode] = useState(null);
  const [toast, setToast] = useState('');

  // ---- Auth guard ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) router.push('/login');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) router.push('/login');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  // ---- Data loading ----
  const loadData = useCallback(async () => {
    const { data: hoaData, error: hoaErr } = await supabase.from('hoas').select('*, documents(*)').order('name');
    if (hoaErr) { showToast('Error loading HOAs: ' + hoaErr.message); return; }
    setHoas(hoaData || []);
    const { data: jobData, error: jobErr } = await supabase.from('jobs').select('*');
    if (jobErr) { showToast('Error loading jobs: ' + jobErr.message); return; }
    setJobs(jobData || []);
  }, []);

  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ---- HOA CRUD ----
  async function saveHoa(form) {
    if (!form.name?.trim()) { showToast('HOA name is required'); return; }
    const payload = {
      name: form.name.trim(), mgmt_co: form.mgmt_co || '', contact_name: form.contact_name || '',
      phone: form.phone || '', email: form.email || '', address: form.address || '',
      qualifications: form.qualifications || '', notes: form.notes || ''
    };
    if (form.id) {
      const { error } = await supabase.from('hoas').update(payload).eq('id', form.id);
      if (error) { showToast(error.message); return; }
    } else {
      const { data, error } = await supabase.from('hoas').insert(payload).select().single();
      if (error) { showToast(error.message); return; }
      setSelectedHoaId(data.id);
    }
    setHoaModal(null);
    loadData();
  }

  async function deleteHoa(id) {
    if (!confirm('Delete this HOA and all its linked jobs and documents? This cannot be undone.')) return;
    const { error } = await supabase.from('hoas').delete().eq('id', id);
    if (error) { showToast(error.message); return; }
    if (selectedHoaId === id) setSelectedHoaId(null);
    loadData();
  }

  // ---- Job CRUD ----
  async function saveJob(form) {
    if (!form.hoa_id) { showToast('Choose an HOA'); return; }
    if (!form.address?.trim()) { showToast('Job address is required'); return; }
    const payload = {
      hoa_id: form.hoa_id, job_number: form.job_number || '', job_name: form.job_name || '',
      address: form.address.trim(), status: form.status || 'Need to Submit',
      assigned_date: form.assigned_date || null,
      assigned_to: form.assigned_to || '',
      date_submitted: form.date_submitted || null, date_approved: form.date_approved || null,
      notes: form.notes || ''
    };
    if (form.id) {
      const { error } = await supabase.from('jobs').update(payload).eq('id', form.id);
      if (error) { showToast(error.message); return; }
    } else {
      const { error } = await supabase.from('jobs').insert(payload);
      if (error) { showToast(error.message); return; }
    }
    setJobModal(null);
    loadData();
  }

  async function deleteJob(id) {
    if (!confirm('Delete this job?')) return;
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) { showToast(error.message); return; }
    loadData();
  }

  // ---- Documents ----
  async function handleDocUpload(hoaId, file) {
    if (!file) return;
    const path = `${hoaId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('hoa-documents').upload(path, file);
    if (upErr) { showToast('Upload failed: ' + upErr.message); return; }
    const { error: dbErr } = await supabase.from('documents').insert({ hoa_id: hoaId, file_name: file.name, storage_path: path });
    if (dbErr) { showToast(dbErr.message); return; }
    showToast('Document uploaded');
    loadData();
  }

  async function downloadDoc(doc) {
    const { data, error } = await supabase.storage.from('hoa-documents').createSignedUrl(doc.storage_path, 60);
    if (error) { showToast(error.message); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function deleteDoc(doc) {
    await supabase.storage.from('hoa-documents').remove([doc.storage_path]);
    await supabase.from('documents').delete().eq('id', doc.id);
    loadData();
  }

  // ---- CSV import ----
  function processCsv(file, mode) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        let added = 0, skipped = 0;
        if (mode === 'hoa') {
          for (const row of results.data) {
            const name = (row.name || '').trim();
            if (!name) continue;
            if (hoas.some(h => h.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
            const { error } = await supabase.from('hoas').insert({
              name, mgmt_co: row.mgmtCo || '', contact_name: row.contactName || '',
              phone: row.phone || '', email: row.email || '', address: row.address || '',
              qualifications: row.qualifications || '', notes: row.notes || ''
            });
            if (!error) added++; else skipped++;
          }
        } else {
          for (const row of results.data) {
            const hoaName = (row.hoaName || '').trim();
            const hoa = hoas.find(h => h.name.toLowerCase() === hoaName.toLowerCase());
            if (!hoa || !row.address) { skipped++; continue; }
            const { error } = await supabase.from('jobs').insert({
              hoa_id: hoa.id, job_number: row.jobNumber || '', job_name: row.jobName || '',
              address: row.address, status: row.status || 'Need to Submit',
              assigned_date: row.assignedDate || null,
              assigned_to: row.assignedTo || '',
              date_submitted: row.dateSubmitted || null, date_approved: row.dateApproved || null,
              notes: row.notes || ''
            });
            if (!error) added++; else skipped++;
          }
        }
        setCsvMode(null);
        loadData();
        showToast(`Imported ${added}, skipped ${skipped}`);
      }
    });
  }

  // ---- Print ----
  function printHoaReport(hoa) {
    const hoaJobs = jobs.filter(j => j.hoa_id === hoa.id);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${hoa.name} — HOA Report</title>
      <style>body{font-family:sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #ccc;padding:6px;text-align:left;} th{background:#f0f0f0;}</style>
      </head><body>
      <h1>${esc(hoa.name)}</h1>
      <p style="color:#666;">HOA Report — printed ${new Date().toLocaleDateString()}</p>
      <table style="margin-bottom:20px;">
        <tr><td><b>Management Co:</b> ${esc(hoa.mgmt_co)}</td><td><b>Contact:</b> ${esc(hoa.contact_name)}</td></tr>
        <tr><td><b>Phone:</b> ${esc(hoa.phone)}</td><td><b>Email:</b> ${esc(hoa.email)}</td></tr>
        <tr><td colspan="2"><b>Address:</b> ${esc(hoa.address)}</td></tr>
      </table>
      <h3>Qualifications / Submittal Requirements</h3><p>${esc(hoa.qualifications) || '—'}</p>
      <h3>Notes</h3><p>${esc(hoa.notes) || '—'}</p>
      <h3>Jobs (${hoaJobs.length})</h3>
      <table>
        <tr><th>Job #</th><th>Job Name</th><th>Address</th><th>Status</th><th>Assigned To</th><th>Assigned Date</th><th>Submitted</th><th>Approved</th><th>Notes</th></tr>
        ${hoaJobs.map(j => `<tr><td>${esc(j.job_number)}</td><td>${esc(j.job_name)}</td><td>${esc(j.address)}</td><td>${esc(j.status)}</td><td>${esc(j.assigned_to)||''}</td><td>${esc(j.assigned_date)||''}</td><td>${esc(j.date_submitted)||''}</td><td>${esc(j.date_approved)||''}</td><td>${esc(j.notes)}</td></tr>`).join('')}
      </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  function printJobsReport(rows, filterLabel) {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Jobs Report — ${esc(filterLabel)}</title>
      <style>body{font-family:sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #ccc;padding:6px;text-align:left;} th{background:#f0f0f0;}</style>
      </head><body>
      <h1>Jobs Report</h1>
      <p style="color:#666;">Filter: ${esc(filterLabel)} — printed ${new Date().toLocaleDateString()} — ${rows.length} job${rows.length !== 1 ? 's' : ''}</p>
      <table>
        <tr><th>Job #</th><th>Job Name</th><th>HOA</th><th>Address</th><th>Status</th><th>Assigned To</th><th>Assigned Date</th><th>Submitted</th><th>Approved</th><th>Notes</th></tr>
        ${rows.map(j => {
          const hoa = hoas.find(h => h.id === j.hoa_id);
          return `<tr><td>${esc(j.job_number)}</td><td>${esc(j.job_name)}</td><td>${esc(hoa ? hoa.name : 'Unlinked')}</td><td>${esc(j.address)}</td><td>${esc(j.status)}</td><td>${esc(j.assigned_to)||''}</td><td>${esc(j.assigned_date)||''}</td><td>${esc(j.date_submitted)||''}</td><td>${esc(j.date_approved)||''}</td><td>${esc(j.notes)}</td></tr>`;
        }).join('')}
      </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  if (session === undefined) return <div className="empty-state">Loading…</div>;
  if (!session) return null;

  const selectedHoa = hoas.find(h => h.id === selectedHoaId);
  const q = search.toLowerCase().trim();
  const filteredHoas = hoas.filter(h => {
    if (!q) return true;
    return h.name.toLowerCase().includes(q) || (h.mgmt_co || '').toLowerCase().includes(q) ||
      (h.contact_name || '').toLowerCase().includes(q) || (h.address || '').toLowerCase().includes(q);
  });

  const statCounts = {
    total: hoas.length, totalJobs: jobs.length,
    ...Object.fromEntries(JOB_STATUSES.map(s => [s, jobs.filter(j => j.status === s).length]))
  };

  const jq = jobSearch.toLowerCase().trim();
  const jobRows = jobs.filter(j => jobsFilter === 'All' || j.status === jobsFilter)
    .filter(j => techFilter === 'All' || j.assigned_to === techFilter)
    .filter(j => {
      if (!jq) return true;
      const hoa = hoas.find(h => h.id === j.hoa_id);
      return (j.job_number || '').toLowerCase().includes(jq) ||
        (j.job_name || '').toLowerCase().includes(jq) ||
        (j.address || '').toLowerCase().includes(jq) ||
        (hoa?.name || '').toLowerCase().includes(jq);
    })
    .sort((a, b) => (a.date_submitted || '').localeCompare(b.date_submitted || ''));

  return (
    <>
      <header>
        <h1>HOA <span>Tracker</span></h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={() => setView(view === 'hoas' ? 'jobs' : 'hoas')}>
            {view === 'hoas' ? 'View All Jobs' : 'Back to HOAs'}
          </button>
          <button className="btn-gold" onClick={() => setHoaModal({})}>+ New HOA</button>
          <button className="btn-outline" onClick={() => setCsvMode('hoa')}>Upload HOA CSV</button>
          <button className="btn-outline" onClick={() => setCsvMode('job')}>Upload Jobs CSV</button>
          <button className="btn-outline" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      <div className="stats-bar">
        {[['Total HOAs', statCounts.total, null], ['Total Jobs', statCounts.totalJobs, 'All'],
          ...JOB_STATUSES.map(s => [s, statCounts[s], s])].map(([label, num, filterVal]) => (
          <div
            className="stat"
            key={label}
            style={{ cursor: filterVal ? 'pointer' : 'default' }}
            onClick={filterVal ? () => { setJobsFilter(filterVal); setJobSearch(''); setView('jobs'); } : undefined}
          >
            <div className="num">{num}</div><div className="label">{label}</div>
          </div>
        ))}
      </div>

      {view === 'hoas' ? (
        <div className="layout">
          <div className="panel-list">
            <div className="search-box">
              <input placeholder="Search HOA name, management co, contact, or address..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="hoa-list">
              {filteredHoas.length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No matches.</div>}
              {filteredHoas.map(h => {
                const count = jobs.filter(j => j.hoa_id === h.id).length;
                return (
                  <div key={h.id} className={`hoa-item ${h.id === selectedHoaId ? 'active' : ''}`} onClick={() => setSelectedHoaId(h.id)}>
                    <div className="name">{h.name}</div>
                    <div className="sub">{h.mgmt_co || 'No management co. listed'}</div>
                    <div className="jobcount">{count} job{count !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-detail">
            {!selectedHoa ? (
              <div className="empty-state">Select an HOA on the left, or add a new one to get started.</div>
            ) : (
              <HoaDetail
                hoa={selectedHoa}
                jobs={jobs.filter(j => j.hoa_id === selectedHoa.id)}
                onEdit={() => setHoaModal(selectedHoa)}
                onDelete={() => deleteHoa(selectedHoa.id)}
                onPrint={() => printHoaReport(selectedHoa)}
                onAddJob={() => setJobModal({ hoa_id: selectedHoa.id })}
                onEditJob={(j) => setJobModal(j)}
                onDeleteJob={deleteJob}
                onDocUpload={(file) => handleDocUpload(selectedHoa.id, file)}
                onDocDownload={downloadDoc}
                onDocDelete={deleteDoc}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="layout">
          <div className="panel-detail" style={{ flex: 1 }}>
            <div className="detail-header">
              <h2 style={{ margin: 0 }}>All Jobs</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-outline btn-sm" onClick={() => {
                  const parts = [];
                  if (jobsFilter !== 'All') parts.push(jobsFilter);
                  if (techFilter !== 'All') parts.push(techFilter);
                  printJobsReport(jobRows, parts.length ? parts.join(' — ') : 'All Jobs');
                }}>Print Report</button>
                <button className="btn-gold btn-sm" onClick={() => setJobModal(hoas.length ? {} : null) || (!hoas.length && showToast('Add an HOA first'))}>+ Add Job</button>
              </div>
            </div>
            <div className="search-box" style={{ padding: '0 0 12px 0', border: 'none' }}>
              <input placeholder="Search job #, name, address, or HOA..." value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {['All', ...JOB_STATUSES].map(s => {
                const count = s === 'All' ? jobs.length : jobs.filter(j => j.status === s).length;
                return (
                  <button key={s} className={jobsFilter === s ? 'btn-gold btn-sm' : 'btn-outline btn-sm'} onClick={() => setJobsFilter(s)}>
                    {s} ({count})
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {['All', ...TECHS].map(t => {
                const count = t === 'All' ? jobs.length : jobs.filter(j => j.assigned_to === t).length;
                return (
                  <button key={t} className={techFilter === t ? 'btn-navy btn-sm' : 'btn-outline btn-sm'} onClick={() => setTechFilter(t)}>
                    {t === 'All' ? 'All Techs' : t} ({count})
                  </button>
                );
              })}
            </div>
            <table>
              <thead>
                <tr><th>Job #</th><th>Job Name</th><th>HOA</th><th>Address</th><th>Status</th><th>Assigned To</th><th>Assigned Date</th><th>Submitted</th><th>Approved</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {jobRows.length === 0 && <tr><td colSpan={11} style={{ color: '#999' }}>No jobs match this filter.</td></tr>}
                {jobRows.map(j => {
                  const hoa = hoas.find(h => h.id === j.hoa_id);
                  return (
                    <tr key={j.id}>
                      <td>{j.job_number || '—'}</td>
                      <td>{j.job_name || '—'}</td>
                      <td>{hoa ? <a href="#" style={{ color: 'var(--gold-light)', fontWeight: 600, textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setSelectedHoaId(hoa.id); setView('hoas'); }}>{hoa.name}</a> : 'Unlinked'}</td>
                      <td>{j.address}</td>
                      <td><span className="status-pill">{j.status}</span></td>
                      <td>{j.assigned_to || '—'}</td>
                      <td>{j.assigned_date || '—'}</td>
                      <td>{j.date_submitted || '—'}</td>
                      <td>{j.date_approved || '—'}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'pre-wrap' }}>{j.notes || '—'}</td>
                      <td>
                        <button className="btn-navy btn-sm" onClick={() => setJobModal(j)}>Edit</button>{' '}
                        <button className="btn-danger btn-sm" onClick={() => deleteJob(j.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hoaModal !== null && <HoaModal hoa={hoaModal} onSave={saveHoa} onClose={() => setHoaModal(null)} />}
      {jobModal !== null && <JobModal job={jobModal} hoas={hoas} onSave={saveJob} onClose={() => setJobModal(null)} />}
      {csvMode && <CsvModal mode={csvMode} onImport={(file) => processCsv(file, csvMode)} onClose={() => setCsvMode(null)} />}
      {toast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--gold)', color: 'var(--navy)', padding: '10px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
    </>
  );
}

function HoaDetail({ hoa, jobs, onEdit, onDelete, onPrint, onAddJob, onEditJob, onDeleteJob, onDocUpload, onDocDownload, onDocDelete }) {
  return (
    <>
      <div className="detail-header">
        <div>
          <h2>{hoa.name}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{hoa.address}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-navy btn-sm" onClick={onEdit}>Edit</button>
          <button className="btn-gold btn-sm" onClick={onPrint}>Print Report</button>
          <button className="btn-danger btn-sm" onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="contact-grid">
        <div><span className="k">Management Co.</span>{hoa.mgmt_co || '—'}</div>
        <div><span className="k">Contact Name</span>{hoa.contact_name || '—'}</div>
        <div><span className="k">Phone</span>{hoa.phone || '—'}</div>
        <div><span className="k">Email</span>{hoa.email || '—'}</div>
      </div>

      <section className="block">
        <h3>Qualifications / Submittal Requirements</h3>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{hoa.qualifications || 'None on file.'}</div>
      </section>

      <section className="block">
        <h3>Notes</h3>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{hoa.notes || 'No notes yet.'}</div>
      </section>

      <section className="block">
        <h3>Documents <label className="btn-outline btn-sm" style={{ cursor: 'pointer' }}>+ Upload PDF
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onDocUpload(e.target.files[0]); e.target.value = ''; }} />
        </label></h3>
        {(!hoa.documents || hoa.documents.length === 0) && <div style={{ fontSize: 13, color: '#999' }}>No documents uploaded.</div>}
        {hoa.documents?.map(d => (
          <div className="doc-item" key={d.id}>
            <a href="#" onClick={(e) => { e.preventDefault(); onDocDownload(d); }}>{d.file_name}</a>
            <span style={{ color: 'var(--text-muted)' }}>
              {new Date(d.uploaded_at).toLocaleDateString()}{' '}
              <button className="btn-danger btn-sm" onClick={() => onDocDelete(d)}>✕</button>
            </span>
          </div>
        ))}
      </section>

      <section className="block">
        <h3>Jobs in this Community ({jobs.length}) <button className="btn-outline btn-sm" onClick={onAddJob}>+ Add Job</button></h3>
        <table>
          <thead><tr><th>Job #</th><th>Job Name</th><th>Address</th><th>Status</th><th>Assigned To</th><th>Assigned Date</th><th>Submitted</th><th>Approved</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {jobs.length === 0 && <tr><td colSpan={10} style={{ color: '#999' }}>No jobs linked yet.</td></tr>}
            {jobs.map(j => (
              <tr key={j.id}>
                <td>{j.job_number || '—'}</td>
                <td>{j.job_name || '—'}</td>
                <td>{j.address}</td>
                <td><span className="status-pill">{j.status}</span></td>
                <td>{j.assigned_to || '—'}</td>
                <td>{j.assigned_date || '—'}</td>
                <td>{j.date_submitted || '—'}</td>
                <td>{j.date_approved || '—'}</td>
                <td style={{ maxWidth: 200, whiteSpace: 'pre-wrap' }}>{j.notes || '—'}</td>
                <td>
                  <button className="btn-navy btn-sm" onClick={() => onEditJob(j)}>Edit</button>{' '}
                  <button className="btn-danger btn-sm" onClick={() => onDeleteJob(j.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function HoaModal({ hoa, onSave, onClose }) {
  const [form, setForm] = useState({
    id: hoa.id, name: hoa.name || '', mgmt_co: hoa.mgmt_co || '', contact_name: hoa.contact_name || '',
    phone: hoa.phone || '', email: hoa.email || '', address: hoa.address || '',
    qualifications: hoa.qualifications || '', notes: hoa.notes || ''
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{hoa.id ? 'Edit HOA' : 'New HOA'}</h3>
        <div className="form-row"><label>HOA / Community Name</label><input value={form.name} onChange={set('name')} /></div>
        <div className="form-row"><label>Management Company</label><input value={form.mgmt_co} onChange={set('mgmt_co')} /></div>
        <div className="form-row"><label>Contact Name</label><input value={form.contact_name} onChange={set('contact_name')} /></div>
        <div className="form-row"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
        <div className="form-row"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
        <div className="form-row"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
        <div className="form-row"><label>Qualifications / Submittal Requirements</label><textarea value={form.qualifications} onChange={set('qualifications')} /></div>
        <div className="form-row"><label>Notes</label><textarea value={form.notes} onChange={set('notes')} /></div>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function JobModal({ job, hoas, onSave, onClose }) {
  const [form, setForm] = useState({
    id: job.id, hoa_id: job.hoa_id || (hoas[0] && hoas[0].id) || '',
    job_number: job.job_number || '', job_name: job.job_name || '', address: job.address || '',
    status: job.status || 'Need to Submit', assigned_to: job.assigned_to || '', assigned_date: job.assigned_date || '',
    date_submitted: job.date_submitted || '', date_approved: job.date_approved || '',
    notes: job.notes || ''
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{job.id ? 'Edit Job' : 'New Job'}</h3>
        <div className="form-row"><label>HOA / Community</label>
          <select value={form.hoa_id} onChange={set('hoa_id')}>
            {hoas.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Job #</label><input value={form.job_number} onChange={set('job_number')} placeholder="e.g. 2026-0142" /></div>
        <div className="form-row"><label>Job Name</label><input value={form.job_name} onChange={set('job_name')} placeholder="e.g. Smith Residence" /></div>
        <div className="form-row"><label>Job Address</label><input value={form.address} onChange={set('address')} /></div>
        <div className="form-row"><label>Job Status</label>
          <select value={form.status} onChange={set('status')}>
            {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Assigned To</label>
          <select value={form.assigned_to} onChange={set('assigned_to')}>
            <option value="">Unassigned</option>
            {TECHS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Date Assigned</label><input type="date" value={form.assigned_date} onChange={set('assigned_date')} /></div>
        <div className="form-row"><label>Date Submitted</label><input type="date" value={form.date_submitted} onChange={set('date_submitted')} /></div>
        <div className="form-row"><label>Date Approved</label><input type="date" value={form.date_approved} onChange={set('date_approved')} /></div>
        <div className="form-row"><label>Notes</label><textarea value={form.notes} onChange={set('notes')} /></div>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function CsvModal({ mode, onImport, onClose }) {
  const [file, setFile] = useState(null);
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{mode === 'hoa' ? 'Upload HOA CSV' : 'Upload Jobs CSV'}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {mode === 'hoa'
            ? 'Columns: name, mgmtCo, contactName, phone, email, address, qualifications, notes. Existing HOAs (matched by name) are skipped.'
            : 'Columns: hoaName, jobNumber, jobName, address, status, assignedTo, assignedDate, dateSubmitted, dateApproved, notes. hoaName must match an existing HOA. assignedTo should be Tech 1, Tech 2, or Tech 3.'}
        </p>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => file && onImport(file)}>Import</button>
        </div>
      </div>
    </div>
  );
}
