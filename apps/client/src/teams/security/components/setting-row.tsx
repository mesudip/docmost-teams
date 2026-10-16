import React from "react";
import { Text } from "@mantine/core";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row.tsx";

type SettingRowProps = {
  title: string;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
};

// Title and description on the left, the control on the right; extra
// content (notes, inputs) goes underneath.
export function SettingRow({
  title,
  description,
  control,
  children,
}: SettingRowProps) {
  return (
    <div>
      <ResponsiveSettingsRow>
        <ResponsiveSettingsContent>
          <Text size="md" fw={500}>
            {title}
          </Text>
          {description && (
            <Text size="sm" c="dimmed" component="div">
              {description}
            </Text>
          )}
        </ResponsiveSettingsContent>
        {control && (
          <ResponsiveSettingsControl>{control}</ResponsiveSettingsControl>
        )}
      </ResponsiveSettingsRow>
      {children}
    </div>
  );
}
