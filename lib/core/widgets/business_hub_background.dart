import 'package:flutter/material.dart';

import '../theme/business_hub_palette.dart';

class BusinessHubBackground extends StatelessWidget {
  const BusinessHubBackground({super.key, required this.palette});

  final BusinessHubPalette palette;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(gradient: palette.backgroundGradient),
      child: CustomPaint(
        painter: _BusinessHubGridPainter(palette),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _BusinessHubGridPainter extends CustomPainter {
  const _BusinessHubGridPainter(this.palette);

  final BusinessHubPalette palette;

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = palette.border.withValues(alpha: 0.18)
      ..strokeWidth = 1;
    const step = 42.0;
    for (var x = 0.0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), linePaint);
    }
    for (var y = 0.0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
    }

    final glowPaint = Paint()
      ..shader =
          RadialGradient(
            colors: [
              palette.accent.withValues(alpha: 0.18),
              Colors.transparent,
            ],
          ).createShader(
            Rect.fromCircle(
              center: Offset(size.width * 0.88, size.height * 0.08),
              radius: size.shortestSide * 0.55,
            ),
          );
    canvas.drawCircle(
      Offset(size.width * 0.88, size.height * 0.08),
      size.shortestSide * 0.55,
      glowPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _BusinessHubGridPainter oldDelegate) {
    return oldDelegate.palette != palette;
  }
}
