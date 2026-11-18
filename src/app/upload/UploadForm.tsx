"use client";

import { useActionState } from "react";
import { uploadCsv, type UploadState } from "./actions";

const initial: UploadState = { errors: [] };

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadCsv, initial);
  return (
    <form action={action}>
      <div className="row">
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload and replace"}
        </button>
      </div>
      {state.message && <p className="error small">{state.message}</p>}
      {state.errors.length > 0 && (
        <ul className="errors">
          {state.errors.map((e) => (
            <li key={`${e.line}-${e.message}`}>
              Line {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
