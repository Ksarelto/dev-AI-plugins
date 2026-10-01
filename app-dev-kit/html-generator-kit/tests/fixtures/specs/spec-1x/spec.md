---
spec-version: "1.2"
timecode: "20250601-000001"
type: app
status: approved
metadata:
  slug: note-vault
  title: Note Vault
  created: "2025-06-01T00:00:00Z"
  updated: "2025-06-01T00:00:00Z"
context:
  problem: Field engineers lose track of inspection notes scattered across chat threads.
  goal: One searchable list of notes with a clear status per note.
  target-users: [Engineer]
entities:
  - name: Note
    description: One inspection note.
    fields:
      - name: id
        type: string
        required: true
        description: Stable identifier, never reused
      - name: title
        type: string
        required: true
        description: Short title an engineer would recognise
      - name: status
        type: NoteStatus
        required: true
        description: "Review lifecycle. One of: DRAFT, SUBMITTED, APPROVED"
      - name: createdAt
        type: string
        required: true
        description: ISO timestamp
ui-surface:
  screens:
    - id: SCR-001
      title: Notes
      route: /notes
      notes: List and filter all Notes; each row opens the note detail.
    - id: SCR-002
      title: Note Detail
      route: /notes/:id
      notes: View a single Note's information.
api-surface:
  endpoints:
    - id: API-001
      method: GET
      path: /v1/notes
      description: List notes
      auth-required: true
  mutations:
    - id: API-001
      method: GET
      path: /v1/notes
      description: List notes
      auth-required: true
    - id: API-002
      method: POST
      path: /v1/notes
      description: Create a note
      auth-required: true
---

# Note Vault

Legacy 1.x-shaped spec fixture: no `page-type`/`primary-entity` on screens, no `state-machines`,
status values embedded in the field description ("One of: ...") rather than a `values:` array, and
`endpoints`/`mutations` both listing API-001 (duplicate-by-id, as 1.x writers did).
