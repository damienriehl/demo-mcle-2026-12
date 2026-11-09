const roots: Record<string, string> = { title: 'Matter title', practiceArea: 'Practice area', forum: 'Court or forum', client: 'Client', parties: 'Party', timeline: 'Timeline event', documents: 'Document', deadlines: 'Deadline', clientFacing: 'Client update' };

export function fieldLabel(path: string) {
  return path.split('.').map((part, i) => i === 0 ? roots[part] ?? part : /^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' ');
}
