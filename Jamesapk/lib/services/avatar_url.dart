import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

const String _base = 'https://millerstorm.tech';

/// Small, fast avatar URL.
///
/// Profile photos are uploaded at full camera resolution (often 3–8 MB), and
/// avatars were downloading that whole file just to paint a 40 px circle —
/// that's the "photos take forever" bug. Route same-site images through the
/// web server's built-in optimizer (`/_next/image`), which serves a ~10–20 KB
/// 256 px WebP with a 4-hour CDN cache instead. External URLs pass through
/// untouched (the optimizer only allows our own uploads).
String avatarUrl(String raw, {int width = 256}) {
  if (raw.isEmpty) return raw;
  String path;
  if (raw.startsWith('$_base/')) {
    path = raw.substring(_base.length);
  } else if (raw.startsWith('/')) {
    path = raw;
  } else {
    return raw;
  }
  return '$_base/_next/image?url=${Uri.encodeComponent(path)}&w=$width&q=75';
}

/// Drop-in [ImageProvider] for avatars: optimized URL + disk cache, so a photo
/// downloads once (small) and is instant on every later appearance.
ImageProvider avatarProvider(String raw, {int width = 256}) =>
    CachedNetworkImageProvider(avatarUrl(raw, width: width));

/// Same optimizer for any same-site image where a thumbnail is being painted —
/// chat photo bubbles (640), reply previews (128), etc. Open the ORIGINAL url
/// for the full-screen viewer, never this one.
String optimizedImageUrl(String raw, {int width = 640}) =>
    avatarUrl(raw, width: width);
