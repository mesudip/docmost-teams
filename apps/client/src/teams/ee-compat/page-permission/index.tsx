import ShareModal from "@/features/share/components/share-modal";

type PageShareModalProps = {
  readOnly: boolean;
};

// The page Share button: core public sharing only. docmost-teams has no
// page-level permissions.
export function PageShareModal({ readOnly }: PageShareModalProps) {
  return <ShareModal readOnly={readOnly} />;
}
