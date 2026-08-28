# Provenance and compatibility policy

## Original implementation

The JavaScript engine and browser rendering code in this repository are
licensed under BSD-3-Clause. Contributions must be independently written.

The GPL-3.0 [axx0/Civ2-clone](https://github.com/axx0/Civ2-clone) project is a
technical reference for observable game behavior, sprite coordinates, rules,
and file formats. Its source code and binaries are not included here. Code
must not be copied or translated from that project into this BSD-licensed
repository.

## Original game material

The running Civilization II Multiplayer Gold Edition game is the visual and
behavioral authority. MGE-derived browser files are outside the BSD licence;
see [../ASSET-NOTICE.md](../ASSET-NOTICE.md).

Public-domain and Creative Commons source artwork used by the modernized
high-resolution setup backgrounds is recorded in
[image-assets.md](image-assets.md). Any new third-party file must record its
source, author, licence, and transformation before it is committed.

## Release boundary

The public tree may contain only files needed by the browser, project
documentation, tests, and extraction tooling. Local reference installations,
third-party source checkouts, comparison renders, screenshots, saved games,
and scratch data must remain ignored.
