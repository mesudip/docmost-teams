// Minimal shapes for the core home prompt; AI chat is not part of
// docmost-teams.

export type PageMention = {
  pageId: string;
  title?: string;
};

export type ChatAttachment = {
  id: string;
  fileName?: string;
};
