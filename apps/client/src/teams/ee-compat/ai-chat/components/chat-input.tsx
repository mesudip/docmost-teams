import type { ChatAttachment, PageMention } from "../types/ai-chat.types";

type ChatInputProps = {
  isStreaming: boolean;
  onSend: (
    content: string,
    mentions: PageMention[],
    attachments: ChatAttachment[],
  ) => void;
  onStop: () => void;
  placeholder?: string;
  autofocus?: boolean;
};

// Only rendered when AI chat is on, which it never is in docmost-teams.
export default function ChatInput(_props: ChatInputProps) {
  return null;
}
