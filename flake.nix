{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = {
    self,
    nixpkgs,
    ...
  }: let
    systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
    forEachSystem = systems: f: builtins.foldl' (acc: system: nixpkgs.lib.recursiveUpdate acc (f system)) {} systems;
  in
    {
      overlays.default = final: prev: {
        gh-pr-versions = self.packages.${final.system}.gh-pr-versions;
      };
    }
    // (forEachSystem systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      packageVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
    in {
      packages.${system} = {
        gh-pr-versions = pkgs.buildNpmPackage rec {
          pname = "gh-pr-versions";
          version = "${packageVersion}-unstable-${self.shortRev or "dirty"}";
          src = ./.;
          npmDepsHash = "sha256-HJu39rarm9Wx1Z/2dM2DWLTNqnzFtvTwlxKQjF2CoHI=";
          npmBuildScript = "prepublishOnly";
        };
        default = self.packages.${system}.gh-pr-versions;
      };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs
          prettierd
        ];
      };
    }));
}
