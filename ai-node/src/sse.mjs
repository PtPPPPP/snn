export function takeSseEvents(buffer) {
  const events = [];
  let remaining = buffer;

  while (true) {
    const boundary = remaining.search(/\r?\n\r?\n/);
    if (boundary < 0) {
      return { events, remaining };
    }

    const separator = remaining.slice(boundary).match(/^\r?\n\r?\n/);
    events.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + (separator?.[0].length ?? 2));
  }
}

export function parseSseEvent(eventBlock) {
  const dataLines = [];

  for (const line of eventBlock.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    return { done: true, payload: null };
  }

  try {
    return { done: false, payload: JSON.parse(data) };
  } catch {
    return { done: false, invalid: true, payload: null };
  }
}
