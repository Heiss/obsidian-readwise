// Typed wrapper around Obsidian's SecretComponent.
//
// SecretComponent deals in the secret's *name*, not its value — but its
// setValue/onChange are typed as plain `string`, so nothing stops a caller from
// passing a token value in (the exact regression that caused `Token <name>` →
// 401). This wrapper takes/returns a branded `SecretName`, so wiring a
// `TokenValue` into it is a compile error. It is the only sanctioned way to
// mount a SecretComponent for the token setting.

import { App, SecretComponent } from "obsidian";
import { asSecretName, type SecretName } from "../core/secretId";

export function mountSecretName(
  app: App,
  el: HTMLElement,
  name: SecretName,
  onChange: (name: SecretName) => void,
): SecretComponent {
  const c = new SecretComponent(app, el);
  c.setValue(name);
  // Boundary: the component reports the selected/created secret *name*.
  c.onChange((raw) => onChange(asSecretName(raw)));
  return c;
}
