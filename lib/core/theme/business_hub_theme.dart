import 'package:flutter/material.dart';

import 'business_hub_palette.dart';

ThemeData businessHubTheme(BuildContext context, BusinessHubPalette palette) {
  final base = Theme.of(context);
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: palette.border.withValues(alpha: 0.8)),
  );

  return base.copyWith(
    scaffoldBackgroundColor: Colors.transparent,
    canvasColor: palette.background,
    cardColor: palette.surface.withValues(alpha: 0.94),
    dividerColor: palette.border.withValues(alpha: 0.55),
    textTheme: base.textTheme.apply(
      bodyColor: palette.text,
      displayColor: palette.text,
    ),
    colorScheme: base.colorScheme.copyWith(
      primary: palette.accent,
      onPrimary: palette.onAccent,
      secondary: palette.textMuted,
      surface: palette.surface,
      onSurface: palette.text,
      onSurfaceVariant: palette.textMuted,
      outline: palette.border,
    ),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: palette.surface.withValues(alpha: 0.9),
      foregroundColor: palette.text,
      surfaceTintColor: Colors.transparent,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.surface.withValues(alpha: 0.62),
      hintStyle: TextStyle(color: palette.textMuted),
      labelStyle: TextStyle(color: palette.textMuted),
      prefixIconColor: palette.textMuted,
      suffixIconColor: palette.textMuted,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: BorderSide(color: palette.accent, width: 1.5),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: palette.surface.withValues(alpha: 0.94),
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: palette.border.withValues(alpha: 0.7)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: palette.onAccent,
        backgroundColor: palette.accent,
        disabledForegroundColor: palette.textMuted.withValues(alpha: 0.55),
        disabledBackgroundColor: palette.surfaceRail,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: palette.text,
        side: BorderSide(color: palette.border.withValues(alpha: 0.9)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: palette.accent),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: palette.accentSoft,
      selectedColor: palette.accent.withValues(alpha: 0.28),
      disabledColor: palette.surfaceRail.withValues(alpha: 0.9),
      labelStyle: TextStyle(color: palette.text),
      secondaryLabelStyle: TextStyle(color: palette.text),
      side: BorderSide(color: palette.border.withValues(alpha: 0.65)),
    ),
  );
}
