import 'package:flutter/material.dart';

@immutable
class BusinessHubPalette {
  const BusinessHubPalette({
    required this.background,
    required this.backgroundEnd,
    required this.surface,
    required this.surfaceRail,
    required this.border,
    required this.accent,
    required this.accentSoft,
    required this.onAccent,
    required this.text,
    required this.textMuted,
  });

  final Color background;
  final Color backgroundEnd;
  final Color surface;
  final Color surfaceRail;
  final Color border;
  final Color accent;
  final Color accentSoft;
  final Color onAccent;
  final Color text;
  final Color textMuted;

  LinearGradient get backgroundGradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [background, backgroundEnd],
  );
}

const dualgiHubPalette = BusinessHubPalette(
  background: Color(0xFF071113),
  backgroundEnd: Color(0xFF101820),
  surface: Color(0xFF162225),
  surfaceRail: Color(0xFF0E171A),
  border: Color(0xFF244046),
  accent: Color(0xFF2DD4BF),
  accentSoft: Color(0x332DD4BF),
  onAccent: Color(0xFF042523),
  text: Color(0xFFF1FCFA),
  textMuted: Color(0xFF9DB5B8),
);

const double businessHubRailBreakpoint = 960;
