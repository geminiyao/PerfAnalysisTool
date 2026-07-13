# CodeBuddy / Claude-style stream-json formatter (dot-source only)
# Handles events: system / assistant / user / result (Anthropic message.content[])

$script:CbStreamConsoleInitialized = $false
$script:CbStreamToolCount = 0

function Initialize-CodeBuddyStreamConsole {
    if ($script:CbStreamConsoleInitialized) { return }
    $utf8 = New-Object System.Text.UTF8Encoding $false
    try {
        [Console]::OutputEncoding = $utf8
        [Console]::InputEncoding = $utf8
        $global:OutputEncoding = $utf8
        if ($IsWindows -or $env:OS -like '*Windows*') {
            & chcp.com 65001 | Out-Null
        }
    }
    catch {
        # Best effort only.
    }
    $script:CbStreamConsoleInitialized = $true
}

function Get-CodeBuddyStreamUtf8Encoding {
    return New-Object System.Text.UTF8Encoding $false
}

function Reset-CodeBuddyStreamState {
    $script:CbStreamToolCount = 0
}

function Write-CodeBuddyStreamLine {
    param(
        [string]$Label,
        [string]$Message,
        [string]$Color = "Gray"
    )
    if (-not $Message) { return }
    $text = "[$Label] $Message"
    Write-Output $text
    Write-Host $text -ForegroundColor $Color
}

function ConvertFrom-CodeBuddyStreamJson {
    param([string]$JsonLine)

    try {
        return ($JsonLine | ConvertFrom-Json -ErrorAction Stop)
    }
    catch {
        try {
            Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop | Out-Null
            $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
            $ser.MaxJsonLength = 67108864
            $ser.RecursionLimit = 100
            $hash = $ser.DeserializeObject($JsonLine)
            return [pscustomobject]$hash
        }
        catch {
            return $null
        }
    }
}

function Format-CodeBuddyContentBlock {
    param($Block)

    if (-not $Block) { return $null }
    $type = [string]$Block.type

    switch ($type) {
        "thinking" {
            $t = [string]$Block.thinking
            if (-not $t) { return $null }
            $t = ($t -replace "\s+", " ").Trim()
            if ($t.Length -gt 300) { $t = $t.Substring(0, 297) + "..." }
            return @{ Label = "THINK"; Message = $t; Color = "DarkGray" }
        }
        "text" {
            $t = [string]$Block.text
            if (-not $t) { return $null }
            $t = ($t -replace "\s+", " ").Trim()
            if ($t.Length -gt 240) { $t = $t.Substring(0, 237) + "..." }
            return @{ Label = "SAY"; Message = $t; Color = "White" }
        }
        "tool_use" {
            $name = [string]$Block.name
            $input = $Block.input
            $detail = ""
            if ($input) {
                if ($input.file_path) { $detail = $input.file_path }
                elseif ($input.path) { $detail = $input.path }
                elseif ($input.command) {
                    $detail = [string]$input.command
                    if ($detail.Length -gt 120) { $detail = $detail.Substring(0, 117) + "..." }
                }
                elseif ($input.pattern) { $detail = $input.pattern }
                elseif ($input.glob_pattern) { $detail = $input.glob_pattern }
                elseif ($input.globPattern) { $detail = $input.globPattern }
            }
            $msg = if ($detail) { "$name  $detail" } else { $name }
            return @{ Label = "TOOL"; Message = $msg; Color = "Yellow"; IsTool = $true }
        }
        default { return $null }
    }
}

function Format-CodeBuddyStreamLine {
    param([string]$JsonLine)

    if (-not $JsonLine -or -not $JsonLine.Trim()) { return }

    $event = ConvertFrom-CodeBuddyStreamJson -JsonLine $JsonLine
    if (-not $event) { return }

    switch ([string]$event.type) {
        "system" {
            if ($event.subtype -eq "init" -or $event.model -or $event.cwd) {
                $model = $event.model
                $cwd = $event.cwd
                $sid = $event.session_id
                Write-CodeBuddyStreamLine "INIT" "model=$model cwd=$cwd session=$sid" "Cyan"
            }
        }
        "assistant" {
            $content = @()
            if ($event.message -and $event.message.content) {
                $content = @($event.message.content)
            }
            foreach ($block in $content) {
                $fmt = Format-CodeBuddyContentBlock -Block $block
                if (-not $fmt) { continue }
                if ($fmt.IsTool) {
                    $script:CbStreamToolCount++
                    Write-CodeBuddyStreamLine ("T{0:D2}" -f $script:CbStreamToolCount) $fmt.Message $fmt.Color
                }
                else {
                    Write-CodeBuddyStreamLine $fmt.Label $fmt.Message $fmt.Color
                }
            }
        }
        "user" {
            # tool_result noise — skip bulk content
        }
        "result" {
            $duration = $null
            if ($null -ne $event.duration_ms) {
                $duration = [math]::Round([double]$event.duration_ms / 1000, 1)
            }
            $isErr = [bool]$event.is_error
            $status = if ($isErr) { "ERROR" } else { "OK" }
            $doneMsg = if ($null -ne $duration) { "$status in ${duration}s" } else { $status }
            Write-CodeBuddyStreamLine "DONE" $doneMsg "Cyan"
            if ($event.result) {
                $result = ([string]$event.result -replace "\s+", " ").Trim()
                if ($result.Length -gt 500) { $result = $result.Substring(0, 497) + "..." }
                Write-CodeBuddyStreamLine "RESULT" $result "Green"
            }
            elseif ($event.subtype) {
                Write-CodeBuddyStreamLine "RESULT" ([string]$event.subtype) "Green"
            }
        }
        default { }
    }
}
