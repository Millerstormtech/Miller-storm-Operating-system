import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../services/storm_chat_logic.dart';

/// A voice message in Storm Chat (PR #106): play / pause, how far along, and
/// its length. The player is only created when someone presses play, so a
/// long chat full of voice notes doesn't start dozens of players.
class VoiceMessageBubble extends StatefulWidget {
  final String url;
  final num durationSec;
  final Color color;

  const VoiceMessageBubble({super.key, required this.url, required this.durationSec, this.color = Colors.white});

  @override
  State<VoiceMessageBubble> createState() => _VoiceMessageBubbleState();
}

class _VoiceMessageBubbleState extends State<VoiceMessageBubble> {
  AudioPlayer? _player;
  final List<StreamSubscription> _subs = [];
  PlayerState _state = PlayerState.stopped;
  Duration _position = Duration.zero;
  Duration? _duration;
  bool _failed = false;

  AudioPlayer _create() {
    final p = AudioPlayer();
    _subs.addAll([
      p.onPlayerStateChanged.listen((s) => mounted ? setState(() => _state = s) : null),
      p.onPositionChanged.listen((d) => mounted ? setState(() => _position = d) : null),
      p.onDurationChanged.listen((d) => mounted ? setState(() => _duration = d) : null),
      p.onPlayerComplete.listen((_) => mounted ? setState(() => _position = Duration.zero) : null),
    ]);
    return p;
  }

  Future<void> _toggle() async {
    try {
      final p = _player ??= _create();
      if (_state == PlayerState.playing) {
        await p.pause();
      } else if (_state == PlayerState.paused) {
        await p.resume();
      } else {
        await p.play(UrlSource(widget.url));
      }
      if (_failed && mounted) setState(() => _failed = false);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = (_duration?.inMilliseconds ?? 0) > 0 ? _duration!.inMilliseconds / 1000 : widget.durationSec.toDouble();
    final done = _position.inMilliseconds / 1000;
    final progress = total > 0 ? (done / total).clamp(0.0, 1.0) : 0.0;
    final playing = _state == PlayerState.playing;
    return SizedBox(
      width: 210,
      child: Row(
        children: [
          IconButton(
            tooltip: playing ? 'Pause' : 'Play voice message',
            onPressed: _toggle,
            icon: Icon(playing ? Icons.pause_circle_filled : Icons.play_circle_fill, color: widget.color, size: 36),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    color: widget.color,
                    backgroundColor: widget.color.withOpacity(0.3),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  _failed
                      ? "Couldn't play"
                      : '🎤 ${playing || done > 0 ? '${formatDuration(done)} / ' : ''}${formatDuration(total)}',
                  style: TextStyle(fontSize: 12, color: widget.color.withOpacity(0.85)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
