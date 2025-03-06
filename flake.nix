{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = {nixpkgs, ...}: let
    systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
    forEachSystem = systems: f: builtins.foldl' (acc: system: nixpkgs.lib.recursiveUpdate acc (f system)) {} systems;
  in
    forEachSystem systems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      packages.${system}.default = pkgs.buildNpmPackage rec {
        pname = "gh-pr-versions";
        version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
        src = ./.;
        npmDepsHash = "sha256-HJu39rarm9Wx1Z/2dM2DWLTNqnzFtvTwlxKQjF2CoHI=";
        npmBuildScript = "prepublishOnly";
      };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs
          prettierd
        ];
      };
    });
}
