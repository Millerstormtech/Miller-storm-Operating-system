import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Port of src/components/Celebration.tsx. Two pieces:
///  - ConfettiBurst: ~34 (or 44) pieces of paper falling once, self-cleaning.
///  - WinMoment: a full-screen card (mark + title + line + "Nice"), with its
///    own bigger confetti burst bundled in.
///
/// Both honour "reduced motion" (MediaQuery.disableAnimations, the Flutter
/// equivalent of prefers-reduced-motion): confetti renders nothing at all,
/// the card still shows the same words with no entrance animation. No sound
/// anywhere, by design — nothing here plays audio.

const List<Color> _confettiColors = [
  Color(0xFFCB0002),
  Color(0xFFF4C542),
  Color(0xFF2C3345),
  Color(0xFFD8DDE4),
  Color(0xFFD89A62),
];

class _ConfettiPiece {
  final double left; // fraction of width, 0..1
  final double delayMs;
  final double drift; // px, -90..90
  final double spinDeg; // 180..720
  final double width; // px, 8..14
  final Color color;
  _ConfettiPiece({
    required this.left,
    required this.delayMs,
    required this.drift,
    required this.spinDeg,
    required this.width,
    required this.color,
  });
}

/// A one-shot burst. Callers re-fire it by changing the widget's `key` (e.g.
/// bump a counter on every quiz pass) — same convention as the web version.
class ConfettiBurst extends StatefulWidget {
  final int pieces;
  final int durationMs;
  const ConfettiBurst({super.key, this.pieces = 34, this.durationMs = 1900});

  @override
  State<ConfettiBurst> createState() => _ConfettiBurstState();
}

class _ConfettiBurstState extends State<ConfettiBurst> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_ConfettiPiece> _pieces;
  bool _spent = false;
  Timer? _spentTimer;

  @override
  void initState() {
    super.initState();
    final rnd = Random();
    _pieces = List.generate(widget.pieces, (i) {
      return _ConfettiPiece(
        left: rnd.nextDouble(),
        delayMs: rnd.nextDouble() * 260,
        drift: (rnd.nextDouble() * 2 - 1) * 90,
        spinDeg: 180 + rnd.nextDouble() * 540,
        width: 8 + rnd.nextDouble() * 6,
        color: _confettiColors[i % _confettiColors.length],
      );
    });
    _controller = AnimationController(vsync: this, duration: Duration(milliseconds: widget.durationMs))..forward();
    // Self-unmounting, same as the web version: nothing here loops.
    _spentTimer = Timer(Duration(milliseconds: widget.durationMs + 400), () {
      if (mounted) setState(() => _spent = true);
    });
  }

  @override
  void dispose() {
    _spentTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_spent || MediaQuery.of(context).disableAnimations) return const SizedBox.shrink();
    final size = MediaQuery.of(context).size;
    return IgnorePointer(
      child: SizedBox.expand(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) => Stack(
            children: _pieces.map((p) {
              final delayFrac = (p.delayMs / widget.durationMs).clamp(0.0, 0.9);
              final raw = delayFrac >= 1.0 ? 0.0 : ((_controller.value - delayFrac) / (1 - delayFrac)).clamp(0.0, 1.0);
              final eased = Curves.easeOut.transform(raw);
              // Fades in over the first 8% of its own run, then fades back
              // out across the rest — matches the CSS keyframes exactly.
              final opacity = raw <= 0
                  ? 0.0
                  : (raw < 0.08 ? raw / 0.08 : (1 - (raw - 0.08) / 0.92).clamp(0.0, 1.0));
              return Positioned(
                left: p.left * size.width,
                top: -16 + eased * size.height * 0.82,
                child: Opacity(
                  opacity: opacity,
                  child: Transform.translate(
                    offset: Offset(eased * p.drift, 0),
                    child: Transform.rotate(
                      angle: eased * p.spinDeg * pi / 180,
                      child: Container(
                        width: p.width,
                        height: p.width + 4,
                        decoration: BoxDecoration(color: p.color, borderRadius: BorderRadius.circular(1)),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

/// A full-screen "you did something" card: emoji + title + line + "Nice".
/// Auto-closes, closes on a veil tap, or on the button — never on tapping the
/// card itself. Exactly one of these is ever on screen at a time (callers
/// hold a single nullable moment in state, same as the web version).
class WinMoment extends StatefulWidget {
  final String mark;
  final String title;
  final String line;
  final VoidCallback onClose;
  final int autoCloseMs;
  const WinMoment({
    super.key,
    required this.mark,
    required this.title,
    required this.line,
    required this.onClose,
    this.autoCloseMs = 4600,
  });

  @override
  State<WinMoment> createState() => _WinMomentState();
}

class _WinMomentState extends State<WinMoment> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 420))..forward();
    _timer = Timer(Duration(milliseconds: widget.autoCloseMs), widget.onClose);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.of(context).disableAnimations;
    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        onTap: widget.onClose,
        behavior: HitTestBehavior.opaque,
        child: Container(
          color: const Color(0x8C0F1218),
          alignment: Alignment.center,
          padding: const EdgeInsets.all(24),
          child: GestureDetector(
            onTap: () {}, // absorb — tapping the card must not close it
            child: Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                if (!reduced) const ConfettiBurst(pieces: 44, durationMs: 2400),
                _buildCard(reduced),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCard(bool reduced) {
    final card = Container(
      width: 320,
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 60, offset: const Offset(0, 24))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(widget.mark, style: const TextStyle(fontSize: 46)),
          const SizedBox(height: 8),
          Text(widget.title, textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textDark)),
          const SizedBox(height: 6),
          Text(widget.line, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: AppColors.textLight)),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: widget.onClose,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCB0002),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                elevation: 0,
              ),
              child: const Text('Nice', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
          ),
        ],
      ),
    );

    if (reduced) return card;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_controller.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, 16 * (1 - t)),
            child: Transform.scale(scale: 0.96 + 0.04 * t, child: child),
          ),
        );
      },
      child: card,
    );
  }
}

/// A one-shot fade + rise entrance for anything that should announce itself
/// once when it appears (a leaderboard podium row, the crown banner, a stat
/// plate) — never a loop, per PR #77's rule. Honors reduced motion by simply
/// appearing at full opacity with no motion.
class EntranceFade extends StatefulWidget {
  final Widget child;
  final Duration delay;
  final double riseBy;
  const EntranceFade({super.key, required this.child, this.delay = Duration.zero, this.riseBy = 14});

  @override
  State<EntranceFade> createState() => _EntranceFadeState();
}

class _EntranceFadeState extends State<EntranceFade> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    if (WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations) {
      _controller.value = 1;
    } else {
      Future.delayed(widget.delay, () { if (mounted) _controller.forward(); });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_controller.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, widget.riseBy * (1 - t)), child: child),
        );
      },
      child: widget.child,
    );
  }
}

/// A background-color pulse that plays exactly once — give it a stable `key`
/// (e.g. keyed on a row's id) so Flutter reuses the same State across
/// rebuilds instead of restarting it; mount it only once the thing it's
/// highlighting becomes true (a focused row arriving from a "See all" link)
/// so the very first mount is the only time it ever plays.
class FlashOnce extends StatefulWidget {
  final Color from;
  final Color to;
  final Widget Function(BuildContext context, Color color) builder;
  const FlashOnce({super.key, required this.from, required this.to, required this.builder});

  @override
  State<FlashOnce> createState() => _FlashOnceState();
}

class _FlashOnceState extends State<FlashOnce> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    if (WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations) {
      _controller.value = 1;
    } else {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final color = Color.lerp(widget.from, widget.to, Curves.easeOut.transform(_controller.value))!;
        return widget.builder(context, color);
      },
    );
  }
}

/// A track that grows its fill from 0 to `pct` (0-100) once, on first build —
/// port of RoleDashboard.tsx's Bar. 700ms, eases out, snaps instantly under
/// reduced motion (transition: none on the web side).
class GrowingBar extends StatefulWidget {
  final double pct; // 0..100
  final double height;
  const GrowingBar({super.key, required this.pct, this.height = 4});

  @override
  State<GrowingBar> createState() => _GrowingBarState();
}

class _GrowingBarState extends State<GrowingBar> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    final reduced = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    _controller = AnimationController(
      vsync: this,
      duration: reduced ? Duration.zero : const Duration(milliseconds: 700),
    )..forward();
  }

  @override
  void didUpdateWidget(covariant GrowingBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pct != widget.pct) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final target = widget.pct.clamp(0.0, 100.0) / 100;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final value = target * Curves.easeOutCubic.transform(_controller.value);
        return ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: value.clamp(0.0, 1.0),
            minHeight: widget.height,
            backgroundColor: AppColors.border.withOpacity(0.5),
            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFCB0002)),
          ),
        );
      },
    );
  }
}
