import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { getMockPersona, PERSONAS, resetMock, setMockPersona } from '@/core/api/mockApi'

/** Preview only (mock mode): switch who you are. Never rendered with a real backend. */
export function DemoBar() {
  const [cur, setCur] = useState(getMockPersona())
  return (
    <div className="demobar" role="region" aria-label="תצוגה מקדימה">
      <span className="only-desk">צפייה בתור</span>
      <select aria-label="צפייה בתור" value={cur} onChange={(e) => { setCur(e.target.value); setMockPersona(e.target.value); location.hash = '#/' }}>
        {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button className="iconbtn" style={{ width: 30, height: 30 }} title="איפוס הנתונים" aria-label="איפוס הנתונים" onClick={() => { resetMock(); setCur(getMockPersona()); location.hash = '#/' }}><RotateCcw size={15} /></button>
    </div>
  )
}
