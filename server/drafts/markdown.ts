export const escapeMarkdownCharacters = (text: string) => text.replace(/([\\`*_{}\[\]<>#!|~])/g, '\\$1');
