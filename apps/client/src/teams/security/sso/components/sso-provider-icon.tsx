import {
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandWindows,
  IconKey,
} from "@tabler/icons-react";

type SsoProviderIconProps = {
  // Provider preset; unknown or missing presets get the neutral icon.
  preset?: string | null;
  size?: number;
};

// Decorative: the provider name next to it carries the meaning.
export function SsoProviderIcon({ preset, size = 18 }: SsoProviderIconProps) {
  const props = { size, stroke: 1.6, "aria-hidden": true } as const;

  switch (preset) {
    case "google":
      return <IconBrandGoogle {...props} />;
    case "microsoft":
      // Tabler has no Microsoft logo; the Windows mark stands in for it.
      return <IconBrandWindows {...props} />;
    case "facebook":
      return <IconBrandFacebook {...props} />;
    default:
      return <IconKey {...props} />;
  }
}
