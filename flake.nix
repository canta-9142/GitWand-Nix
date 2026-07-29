{
  description = "GitWand packaged for Nix and NixOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs = { self, nixpkgs }:
  let 
    supportedSystems = [
      "x86_64-linux"
    ];

    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
  in 
  {
    packages = forAllSystems (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        gitwand = pkgs.callPackage ./nix/package.nix {};
      in
      {
        inherit gitwand;
        default = gitwand;
      }
    );

    apps = forAllSystems (
      system:
      {
        gitwand = {
          type = "app";
          program = "${self.packages.${system}.gitwand}/bin/gitwand";
        };
        default = self.apps.${system}.gitwand;
      }
    );

    checks = forAllSystems (
      system:
      {
        package = self.packages.${system}.gitwand;
      }
    );

    devShells = forAllSystems (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        default = pkgs.mkShell {
          packages = with pkgs; [
            git
            nix-update
            nixfmt-rfc-style
          ];
        };
      }
    );

    formatter = forAllSystems (
      system:
      nixpkgs.legacyPackages.${system}.nixfmt-rfc-style
    );
  };
}