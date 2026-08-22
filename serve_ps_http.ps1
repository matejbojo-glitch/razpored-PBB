$ErrorActionPreference='Stop'
$root = (Get-Location).Path
# Allow optional port argument (default 3000)
$port = if ($args.Count -gt 0) { [int]$args[0] } else { 3000 }
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Serving $root at $prefix"
$mime = @{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'; '.gif'='image/gif'; '.ico'='image/x-icon';
  '.txt'='text/plain'; '.map'='application/json'
}
while ($true) {
  $context = $listener.GetContext()
  $requestUrl = $context.Request.Url.AbsolutePath
  $file = [System.IO.Path]::Combine($root, ($requestUrl.TrimStart('/').Replace('/','\\')))
  if ([string]::IsNullOrEmpty($requestUrl) -or $requestUrl -eq '/') { $file = Join-Path $root 'index.html' }
  elseif (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
  # Special route: /login -> login.html
  if ($requestUrl -eq '/login' -or $requestUrl -eq '/login/') { $file = Join-Path $root 'login.html' }
  if (Test-Path $file -PathType Leaf) {
    try {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $context.Response.ContentLength64 = $bytes.Length
      if ($mime.ContainsKey($ext)) { $context.Response.ContentType = $mime[$ext] } else { $context.Response.ContentType='application/octet-stream' }
      $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
      $context.Response.StatusCode = 200
    } catch {
      $context.Response.StatusCode = 500
      $err=[Text.Encoding]::UTF8.GetBytes('Internal Server Error')
      $context.Response.OutputStream.Write($err,0,$err.Length)
    }
  } else {
    $context.Response.StatusCode = 404
    $nf = [Text.Encoding]::UTF8.GetBytes('Not found')
    $context.Response.ContentType='text/plain'
    $context.Response.OutputStream.Write($nf,0,$nf.Length)
  }
  $context.Response.OutputStream.Close()
}
