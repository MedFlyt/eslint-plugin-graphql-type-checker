#!/usr/bin/env bash

# Bump patch version in package.json & examples/parent-child-demo/package.json, commit as "Release X.Y.Z",
# and add git tag "vX.Y.Z" with message "Release X.Y.Z".

set -o errexit -o pipefail

if [[ !($1 =~ ^major|minor|patch$) ]]; then
echo "Usage: tag-release.sh [major|minor|patch]"
exit 1
fi

set -o nounset

gitStatus=$(git status -s)
if [[ -n $gitStatus ]]; then
echo "ERROR: Working tree has modified/untracked files:"
echo "${gitStatus}"
exit 1
fi

if [[ `cat package.json` =~ .*\"version\":\ *\"([0-9]+)\.([0-9]+)\.([0-9]+)\" ]]
then
  vMajor=${BASH_REMATCH[1]}
  vMinor=${BASH_REMATCH[2]}
  vPatch=${BASH_REMATCH[3]}
  vMajorNew=$vMajor
  vMinorNew=$vMinor
  vPatchNew=$vPatch
  if [[ $1 == major ]]; then vMajorNew=$(( $vMajor + 1 )); vMinorNew=0; vPatchNew=0; fi
  if [[ $1 == minor ]]; then vMinorNew=$(( $vMinor + 1 )); vPatchNew=0; fi
  if [[ $1 == patch ]]; then vPatchNew=$(( $vPatch + 1 )); fi
  newVersion=$vMajorNew.$vMinorNew.$vPatchNew
  echo "Bumping version from ${vMajor}.${vMinor}.${vPatch} to ${newVersion}"

  # Bump version in package.json:
  sed -i '' -e "s/\(\"version\": *\"\).*\(\".*\)$/\1${newVersion}\2/" package.json

  # Npm install to bump versions in package-lock.json and src/demo/package-lock.json:
  pnpm i
  pnpm run --silent install-demo

  git add package.json pnpm-lock.yaml src/demo/pnpm-lock.yaml
  git commit -m "Release ${newVersion}"
  git tag -a "v${newVersion}" -m "Release ${newVersion}"
else
  echo "ERROR: No \"version\" found in package.json"
  exit 1
fi
