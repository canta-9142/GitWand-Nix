{
  lib,
  appimageTools,
  fetchurl,
  nix-update-script,
}:

let
  pname = "gitwand";
  version = "3.6.0";

  src = fetchurl {
    url = "https://github.com/devlint/GitWand/releases/download/v${version}/GitWand_${version}_amd64.AppImage";
    hash = "sha256-txedT6xA5uGxETHnYKnBot9zovW3ai4wSZcaNGPoK6s=";
  };

  appimageContents = appimageTools.extractType2 {
    inherit pname version src;
  };
in
appimageTools.wrapType2 {
  inherit pname version src;

  extraPkgs = pkgs: with pkgs; [
    git
    openssh
    libsecret
  ];

  extraInstallCommands = ''
    desktop_file="$(
      find ${appimageContents} \
        -type f \
        -name '*.desktop' \
        -print \
        -quit
    )"

    if [ -n "$desktop_file ]; then
      install -Dm444 \
        "$desktop_file" \
        "$out/share/applications/gitwand.desktop"
      
      subtituteInPlace "$out/share/applications/gitwand.desktop" \
        --replace-warn "Exec=AppRun" "Exec=gitwand" \
        --replace-warn "Exec=gitwand-desktop" "Exec=gitwand"
    fi

    if [ -d "${appimageContents}/usr/share/icons" ]; then
      mkdir -p "$out/share"
      cp -r "${appimageContents}/usr/share/icons" "$out/share/"
    fi
  '';

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Native Git client with smart confilict resorution";
    homepage = "https://github.com/devlint/GitWand";
    changelog = "https://github.com/devlint/GitWand/releases/tag/v${version}";
    license = lib.license.mit;
    mainProgram = "gitwand";
    platforms = [ "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [
      binaryNativeCode
    ];
  };
}