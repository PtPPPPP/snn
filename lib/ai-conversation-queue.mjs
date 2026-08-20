export function createPerConversationQueue() {
  const queues = new Map();
  return function enqueue(id, operation) {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.then(() => undefined, () => undefined);
    queues.set(id, tracked);
    void tracked.finally(() => {
      if (queues.get(id) === tracked) queues.delete(id);
    }).catch(() => {});
    return next;
  };
}
