"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./icons";

/**
 * A submit button that locks while its form's action runs and says what is happening, so a slow
 * action never looks frozen and a second click can't start the same work twice.
 * `working` is the text shown meanwhile ("Reading the job and your profile…").
 *
 * Several buttons can share one form (Save draft / Send). All of them lock while the form runs;
 * only the one that was pressed swaps its label for `working`.
 */
export function SubmitButton({
  children,
  working,
  className = "btn",
  onClick,
  ...rest
}: Omit<React.ComponentProps<"button">, "type" | "aria-busy"> & { working: string }) {
  const { pending } = useFormStatus();
  // idle -> pressed (this button was clicked) -> running (the form started) -> idle (the action finished).
  // The click lands a moment before the form reports it is pending, so "pressed" must survive that gap.
  const [phase, setPhase] = useState<"idle" | "pressed" | "running">("idle");
  if (phase === "pressed" && pending) setPhase("running");
  else if (phase === "running" && !pending) setPhase("idle");
  const active = phase === "running";
  return (
    <>
      <button
        {...rest}
        type="submit"
        className={className}
        disabled={pending || rest.disabled}
        aria-busy={active}
        onClick={(e) => {
          // A click the browser refuses to submit (a required field is empty) never starts the form.
          if (e.currentTarget.form?.checkValidity() ?? true) setPhase("pressed");
          onClick?.(e);
        }}
      >
        {active ? (
          <>
            <Spinner /> {working}
          </>
        ) : (
          children
        )}
      </button>
      <span role="status" className="sr-only">
        {active ? working : ""}
      </span>
    </>
  );
}
