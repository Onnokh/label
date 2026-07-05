import { type FormEvent, useState } from "react"
import { Check, Save } from "lucide-react"

import { Button } from "../ui/button/button"
import { InputField } from "../ui/input-field/input-field"
import { getSourceName, setSourceName } from "./source-name-storage"

export function SourceNamePanel() {
  const [value, setValue] = useState(() => getSourceName())
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSourceName(value.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="settings-section">
      <div className="section-header">
        <h2 className="section-title">Identify this browser</h2>
        <p className="section-description">Choose how captures from here are grouped.</p>
      </div>
      <form onSubmit={submit} className="settings-form">
        <InputField
          type="text"
          placeholder="e.g. Work Laptop, Home PC"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" aria-label={saved ? "Saved" : "Save source name"} title={saved ? "Saved" : "Save"}>
          {saved ? <Check size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        </Button>
      </form>
    </section>
  )
}
