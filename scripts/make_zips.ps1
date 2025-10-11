Add-Type -AssemblyName System.IO.Compression.FileSystem
function Zip-FolderExcludingNodeModules($src, $dest) {
  if (Test-Path $dest) { Remove-Item $dest -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
  Get-ChildItem -Path $src -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | ForEach-Object {
    $entryName = $_.FullName.Substring($src.Length + 1) -replace '\\','/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  }
  $zip.Dispose()
}

$root = 'C:/Projects/MOJISTORE-ECOM/webdem'
Zip-FolderExcludingNodeModules (Join-Path $root 'api') (Join-Path $root 'api.zip')
Zip-FolderExcludingNodeModules (Join-Path $root 'mojistore') (Join-Path $root 'mojistore.zip')
Write-Output "Created api.zip and mojistore.zip in $root"