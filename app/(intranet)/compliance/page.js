'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../src/context/AuthContext'
import {
  getComplianceRecords,
  addComplianceRecord,
  getComplianceRequirements,
  uploadComplianceFile,
} from '../../../src/sheets'

// ── School-year helpers ────────────────────────────────────────────────────
function getSchoolYear(date = new Date()) {
  const d = new Date(date), y = d.getFullYear()
  return d.getMonth() >= 7 ? `${y}–${y + 1}` : `${y - 1}–${y}`
}
function schoolYearOptions(count = 3) {
  const years = [], d = new Date()
  for (let i = 0; i < count; i++) {
    years.push(getSchoolYear(d))
    d.setFullYear(d.getFullYear() - 1)
  }
  return years
}
const CURRENT_SY = getSchoolYear()

// Normalize active field — handles 'true', 'TRUE', true, 'yes', '1'
function isActive(val) {
  if (typeof val === 'boolean') return val
  return ['true','TRUE','yes','1'].includes(String(val).trim())
}

const DEFAULT_REQS = [
  { key: 'privacy_agreement',    label: 'Privacy & Confidentiality Agreement' },
  { key: 'eligibility_of_care',  label: 'Eligibility of Care for Employees'   },
  { key: 'conflict_of_interest', label: 'Conflict of Interest Policy'          },
  { key: 'document_retention',   label: 'Document Retention Policy'            },
]

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function pct(num, den) { return den > 0 ? Math.round((num / den) * 100) : 0 }

// ── Sign Modal ─────────────────────────────────────────────────────────────
function SignModal({ employee, requirement, schoolYear, token, onSave, onClose }) {
  const [docMode,    setDocMode]    = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [notes,      setNotes]      = useState('')
  const [file,       setFile]       = useState(null)
  const [linkUrl,    setLinkUrl]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [progress,   setProgress]   = useState('')
  const [error,      setError]      = useState(null)

  const canSave = signedDate && docMode && (
    (docMode === 'upload'   && file) ||
    (docMode === 'docusign' && linkUrl.trim())
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setError(null)
    try {
      let documentUrl = '', driveFileId = ''
      if (docMode === 'upload') {
        setProgress('Uploading to Drive…')
        const res = await uploadComplianceFile(token, file, employee.name, requirement.key)
        documentUrl = res.documentUrl
        driveFileId = res.driveFileId
      } else {
        documentUrl = linkUrl.trim()
      }
      setProgress('Saving record…')
      await addComplianceRecord(token, {
        employeeId: employee.id, employeeName: employee.name, employeeEmail: employee.email,
        requirementKey: requirement.key, requirementLabel: requirement.label,
        dueYear: schoolYear, signedDate, notes,
        documentType: docMode, documentUrl, driveFileId,
      })
      onSave()
    } catch (err) {
      setError(err.message); setSaving(false); setProgress('')
    }
  }

  const modeBtn = (mode, label, desc) => (
    <button type="button" onClick={() => setDocMode(mode)} style={{
      flex: 1, padding: '12px 10px', cursor: 'pointer', textAlign: 'left',
      border: `2px solid ${docMode === mode ? '#118CB0' : '#D0DCE1'}`,
      borderRadius: 8,
      background: docMode === mode ? '#E0F2F8' : '#fff',
      transition: 'all 0.12s',
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: docMode === mode ? '#118CB0' : '#393F47', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#888' }}>{desc}</div>
    </button>
  )

  return (
    <div style={S.modalOverlay}>
      <div style={{ ...S.modal, width: 500 }}>
        <h3 style={S.modalTitle}>Record Signature</h3>
        <p style={S.modalSub}>{employee.name}</p>
        <p style={{ ...S.modalSub, marginTop: 0 }}>{requirement.label} · {schoolYear}</p>
        <form onSubmit={handleSubmit}>
          <label style={S.fieldLabel}>Date Signed *</label>
          <input type="date" required value={signedDate} onChange={e => setSignedDate(e.target.value)} style={S.input} />

          <label style={{ ...S.fieldLabel, marginTop: 16 }}>
            Signed Document * <span style={{ color: '#B94040', fontWeight: 400, textTransform: 'none' }}>(one required)</span>
          </label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {modeBtn('upload',   '⬆ Upload File',    'PDF or photo of signed doc')}
            {modeBtn('docusign', '🔗 External Link',  'DocuSign, Drive, or any URL')}
          </div>

          {docMode === 'upload' && (
            <div style={{ border: '2px dashed #D0DCE1', borderRadius: 8, padding: 16, textAlign: 'center', background: '#FAFBFC', marginBottom: 12 }}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" id="compliance-file-input"
                style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
              <label htmlFor="compliance-file-input" style={{ cursor: 'pointer' }}>
                {file
                  ? <><div style={{ fontWeight: 600, fontSize: 13, color: '#118CB0' }}>📄 {file.name}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{(file.size/1024).toFixed(0)} KB · Click to change</div></>
                  : <><div style={{ fontSize: 13, color: '#555' }}>Click to select a file</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>PDF, JPG, PNG, HEIC</div></>
                }
              </label>
            </div>
          )}

          {docMode === 'docusign' && (
            <input type="url" placeholder="https://app.docusign.com/… or Drive link"
              value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              style={{ ...S.input, marginBottom: 12 }} required />
          )}

          <label style={S.fieldLabel}>Notes (optional)</label>
          <input type="text" placeholder="e.g. Signed at all-staff meeting"
            value={notes} onChange={e => setNotes(e.target.value)} style={S.input} />

          {error    && <p style={{ color: '#B94040', fontSize: 13, marginTop: 8 }}>⚠ {error}</p>}
          {progress && <p style={{ color: '#118CB0', fontSize: 13, marginTop: 8 }}>⏳ {progress}</p>}

          <div style={S.modalActions}>
            <button type="button" onClick={onClose} disabled={saving} style={S.btnSecondary}>Cancel</button>
            <button type="submit" disabled={!canSave || saving}
              style={{ ...S.btnPrimary, opacity: (!canSave || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save Signature'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Staff view — own documents only ───────────────────────────────────────
function StaffView({ records, schoolYear, reqs }) {
  const signed   = reqs.filter(req => records.find(r => r.requirementKey === req.key && r.dueYear === schoolYear))
  const unsigned = reqs.filter(req => !records.find(r => r.requirementKey === req.key && r.dueYear === schoolYear))

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={S.subheading}>Your Compliance — {schoolYear}</h2>

      {unsigned.length > 0 && (
        <div style={{ ...S.section, borderLeft: '4px solid #B94040' }}>
          <div style={S.sectionTitle}>⚠ Outstanding ({unsigned.length})</div>
          {unsigned.map(req => (
            <div key={req.key} style={S.docRow}>
              <div style={S.docLabel}>{req.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Not yet recorded for {schoolYear}. Please sign and return to your supervisor.
              </div>
            </div>
          ))}
        </div>
      )}

      {signed.length > 0 && (
        <div style={{ ...S.section, borderLeft: '4px solid #1A6B3C' }}>
          <div style={S.sectionTitle}>✓ Complete ({signed.length})</div>
          {signed.map(req => {
            const rec = records.find(r => r.requirementKey === req.key && r.dueYear === schoolYear)
            return (
              <div key={req.key} style={S.docRow}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={S.docLabel}>{req.label}</div>
                  <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>Signed {formatDate(rec?.signedDate)}</div>
                </div>
                {rec?.documentUrl && (
                  <a href={rec.documentUrl} target="_blank" rel="noopener noreferrer" style={S.docLink}>
                    {rec.documentType === 'docusign' ? '📋 DocuSign ↗' : '📄 View Document ↗'}
                  </a>
                )}
                {rec?.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>{rec.notes}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Admin view — grouped by employee ──────────────────────────────────────
function AdminView({ employees, records, reqs, token, onSigned }) {
  const [schoolYear, setSchoolYear] = useState(CURRENT_SY)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')   // 'all' | 'incomplete' | 'complete'
  const [modal,      setModal]      = useState(null)

  const syYears    = schoolYearOptions(3)
  const activeEmps = employees
    .filter(e => e.active === 'TRUE' || e.active === true || e.active === '' || e.active === undefined)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const syRecords = records.filter(r => r.dueYear === schoolYear)

  const getRecord = (empId, reqKey) =>
    syRecords.find(r => r.employeeId === empId && r.requirementKey === reqKey)

  const empComplete = (emp) =>
    reqs.every(req => !!getRecord(emp.id, req.key))

  const filtered = activeEmps
    .filter(e => !search || (e.name || '').toLowerCase().includes(search.toLowerCase()))
    .filter(e => {
      if (filter === 'complete')   return empComplete(e)
      if (filter === 'incomplete') return !empComplete(e)
      return true
    })

  // Summary stats
  const totalEmps     = activeEmps.length
  const completeEmps  = activeEmps.filter(empComplete).length
  const totalSigs     = syRecords.length
  const totalRequired = totalEmps * reqs.length
  const overall       = pct(totalSigs, totalRequired)

  return (
    <div>
      {/* Summary bar */}
      <div style={S.summaryBar}>
        <div style={S.statBox}>
          <span style={S.statNum}>{totalEmps}</span>
          <span style={S.statLabel}>Staff</span>
        </div>
        <div style={S.statBox}>
          <span style={{ ...S.statNum, color: '#1A6B3C' }}>{completeEmps}</span>
          <span style={S.statLabel}>Fully Complete</span>
        </div>
        <div style={S.statBox}>
          <span style={{ ...S.statNum, color: totalEmps - completeEmps > 0 ? '#B94040' : '#1A6B3C' }}>
            {totalEmps - completeEmps}
          </span>
          <span style={S.statLabel}>Incomplete</span>
        </div>
        <div style={{ ...S.statBox, flex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={S.statLabel}>Overall ({totalSigs} / {totalRequired} signatures)</span>
            <span style={{ ...S.statNum, fontSize: 16, color: overall === 100 ? '#1A6B3C' : '#118CB0' }}>{overall}%</span>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${overall}%`,
              background: overall === 100 ? '#1A6B3C' : overall >= 75 ? '#118CB0' : '#B94040' }} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={S.toolbar}>
        <input type="text" placeholder="Search employees…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, width: 240, marginBottom: 0 }} />
        <div style={{ display: 'flex', gap: 1, background: '#E9E9EA', borderRadius: 8, padding: 2 }}>
          {[['all','All'],['incomplete','Incomplete'],['complete','Complete']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 13,
              fontWeight: filter === val ? 700 : 400,
              background: filter === val ? '#fff' : 'transparent',
              color: filter === val ? '#393F47' : '#888',
              cursor: 'pointer', boxShadow: filter === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>
          {filtered.length} of {totalEmps} employees
        </div>
      </div>

      {/* Employee list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(emp => {
          const complete = empComplete(emp)
          return (
            <div key={emp.id || emp.email} style={{
              background: '#fff',
              border: `1px solid ${complete ? '#C6E8D1' : '#D0DCE1'}`,
              borderLeft: `4px solid ${complete ? '#1A6B3C' : '#B94040'}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Employee header */}
              <div style={{
                padding: '12px 18px',
                background: complete ? '#F5FBF7' : '#FDF5F5',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid #E9E9EA',
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#393F47' }}>{emp.name}</span>
                  {emp.title && <span style={{ fontSize: 12, color: '#888', marginLeft: 10 }}>{emp.title}</span>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: complete ? '#E8F5EE' : '#FDECEA',
                  color: complete ? '#1A6B3C' : '#B94040',
                }}>
                  {complete ? '✓ Complete' : `${reqs.filter(r => !getRecord(emp.id, r.key)).length} outstanding`}
                </span>
              </div>

              {/* Document rows */}
              <div style={{ padding: '4px 0' }}>
                {reqs.map((req, i) => {
                  const rec    = getRecord(emp.id, req.key)
                  const signed = !!rec
                  return (
                    <div key={req.key} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 18px 10px 28px',
                      borderBottom: i < reqs.length - 1 ? '1px solid #F0F0F0' : 'none',
                      flexWrap: 'wrap',
                    }}>
                      {/* Status dot */}
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: signed ? '#1A6B3C' : '#D0DCE1',
                      }} />

                      {/* Doc name */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <span style={{ fontSize: 13, color: signed ? '#393F47' : '#888' }}>
                          {req.label}
                        </span>
                      </div>

                      {/* Signed date */}
                      <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', minWidth: 110 }}>
                        {signed ? formatDate(rec.signedDate) : '—'}
                      </div>

                      {/* Document link */}
                      <div style={{ minWidth: 100, textAlign: 'right' }}>
                        {signed && rec.documentUrl ? (
                          <a href={rec.documentUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, color: '#118CB0', fontWeight: 600, textDecoration: 'none',
                              background: '#E0F2F8', padding: '3px 8px', borderRadius: 5 }}>
                            {rec.documentType === 'docusign' ? 'DocuSign ↗' : 'Doc ↗'}
                          </a>
                        ) : signed ? (
                          <span style={{ fontSize: 11, color: '#aaa' }}>No doc</span>
                        ) : (
                          <button
                            onClick={() => setModal({ employee: emp, requirement: req })}
                            style={{ fontSize: 12, color: '#0D6E8A', fontWeight: 600,
                              background: '#E0F2F8', border: 'none', borderRadius: 5,
                              padding: '3px 10px', cursor: 'pointer' }}>
                            Mark signed
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: 48, fontSize: 14 }}>
            No employees match your filters.
          </div>
        )}
      </div>

      {modal && (
        <SignModal
          employee={modal.employee}
          requirement={modal.requirement}
          schoolYear={schoolYear}
          token={token}
          onSave={() => { setModal(null); onSigned() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function CompliancePage() {
  const { user, token, admin } = useAuth()
  const [employees, setEmployees] = useState([])
  const [records,   setRecords]   = useState([])
  const [reqs,      setReqs]      = useState(DEFAULT_REQS)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const sheetId = process.env.NEXT_PUBLIC_INTRANET_SHEET_ID
      const [empsData, recs, reqsData] = await Promise.all([
        fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Employees?majorDimension=ROWS`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(r => { if (!r.ok) throw new Error(`Employees tab: ${r.status}`); return r.json() })
         .then(d => {
           const [hdr, ...rows] = d.values || []
           if (!hdr) return []
           return rows.map(r => Object.fromEntries(hdr.map((k, i) => [k, r[i] ?? ''])))
         }),
        getComplianceRecords(token),
        getComplianceRequirements(token).catch(() => []),
      ])
      setEmployees(empsData)
      setRecords(recs)
      // Normalize active check — handles TRUE, true, yes, 1 from manual sheet edits
      const active = (reqsData || []).filter(r => isActive(r.active))
      if (active.length > 0) setReqs(active)
    } catch (err) {
      setError('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const myRecords = records.filter(r => r.employeeEmail === user?.email)

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Compliance</h1>
          <p style={S.pageSubtitle}>
            {admin
              ? 'Annual policy acknowledgment tracking — all staff'
              : `Your acknowledgment status · ${CURRENT_SY}`}
          </p>
        </div>
        <div style={S.syPill}>School Year {CURRENT_SY}</div>
      </div>

      {loading && <p style={{ color: '#888', textAlign: 'center', marginTop: 48 }}>Loading…</p>}
      {error   && <p style={{ color: '#B94040', fontSize: 13 }}>{error}</p>}

      {!loading && !error && (
        admin
          ? <AdminView employees={employees} records={records} reqs={reqs} token={token} onSigned={load} />
          : <StaffView records={myRecords} schoolYear={CURRENT_SY} reqs={reqs} />
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  page:         { padding: '32px 40px', maxWidth: 1100, fontFamily: 'Lato, sans-serif', color: '#393F47' },
  pageHeader:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  pageTitle:    { fontSize: 28, fontWeight: 800, fontFamily: '"Open Sans", sans-serif', color: '#118CB0', margin: 0 },
  pageSubtitle: { fontSize: 14, color: '#666', margin: '4px 0 0' },
  syPill:       { background: '#E0F2F8', color: '#0D6E8A', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap' },

  // Staff view
  subheading:   { fontSize: 18, fontWeight: 700, color: '#393F47', marginBottom: 16, fontFamily: '"Open Sans", sans-serif' },
  section:      { background: '#fff', border: '1px solid #D0DCE1', borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  sectionTitle: { padding: '10px 16px', fontWeight: 700, fontSize: 13, color: '#393F47', background: '#FAFBFC', borderBottom: '1px solid #E9E9EA' },
  docRow:       { padding: '12px 16px', borderBottom: '1px solid #F5F5F5' },
  docLabel:     { fontSize: 14, fontWeight: 600, color: '#393F47' },
  docLink:      { display: 'inline-block', marginTop: 6, fontSize: 12, color: '#118CB0', fontWeight: 600,
                  textDecoration: 'none', background: '#E0F2F8', padding: '3px 8px', borderRadius: 5 },

  // Admin summary
  summaryBar:   { display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' },
  statBox:      { flex: 1, minWidth: 110, background: '#fff', border: '1px solid #D0DCE1', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column' },
  statNum:      { fontSize: 26, fontWeight: 800, fontFamily: '"Open Sans", sans-serif', color: '#393F47', lineHeight: 1 },
  statLabel:    { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 },
  progressTrack:{ height: 6, background: '#E9E9EA', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },

  // Toolbar
  toolbar:      { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },

  // Modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:        { background: '#fff', borderRadius: 14, padding: '32px 36px', width: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle:   { margin: '0 0 6px', fontSize: 18, fontWeight: 800, fontFamily: '"Open Sans", sans-serif', color: '#118CB0' },
  modalSub:     { fontSize: 13, color: '#666', marginBottom: 12 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  fieldLabel:   { display: 'block', fontSize: 12, fontWeight: 700, color: '#393F47', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, marginTop: 14 },
  input:        { width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #D0DCE1', borderRadius: 7, boxSizing: 'border-box', color: '#393F47', outline: 'none' },
  btnPrimary:   { background: '#118CB0', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  btnSecondary: { background: '#E9E9EA', color: '#393F47', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
