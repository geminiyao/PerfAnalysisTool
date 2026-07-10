# Agent stream-json formatter functions (dot-source only)

$script:AgentStreamConsoleInitialized = $false
$script:AgentStreamThinkingBuffer = New-Object System.Text.StringBuilder
$script:AgentStreamToolCount = 0
$script:AgentStreamShowThink = $true

function Initialize-AgentStreamConsole {
    if ($script:AgentStreamConsoleInitialized) { return }
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
    $script:AgentStreamConsoleInitialized = $true
}

function Get-AgentStreamUtf8Encoding {
    return New-Object System.Text.UTF8Encoding $false
}

function Reset-AgentStreamState {
    $script:AgentStreamThinkingBuffer = New-Object System.Text.StringBuilder
    $script:AgentStreamToolCount = 0
}

function Write-AgentStreamLine {
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

function ConvertFrom-AgentStreamJson {
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

function Get-AgentToolCallSummary {
    param($ToolCall, [string]$Phase)

    if ($ToolCall.readToolCall) {
        $path = $ToolCall.readToolCall.args.path
        if ($Phase -eq "completed") {
            $err = $ToolCall.readToolCall.result.error.errorMessage
            if ($err) { return "READ FAIL $path -> $err" }
            return "READ OK   $path"
        }
        return "READ      $path"
    }

    if ($ToolCall.writeToolCall) {
        $path = $ToolCall.writeToolCall.args.path
        if ($Phase -eq "completed") {
            $ok = $ToolCall.writeToolCall.result.success
            if ($ok) {
                return "WRITE OK  $path ($($ok.linesCreated) lines)"
            }
            $err = $ToolCall.writeToolCall.result.error.errorMessage
            return "WRITE FAIL $path -> $err"
        }
        return "WRITE     $path"
    }

    if ($ToolCall.shellToolCall) {
        $cmd = $ToolCall.shellToolCall.args.command
        if ($cmd.Length -gt 120) { $cmd = $cmd.Substring(0, 117) + "..." }
        if ($Phase -eq "completed") {
            return "SHELL OK  exit=$($ToolCall.shellToolCall.result.exitCode)  $cmd"
        }
        return "SHELL     $cmd"
    }

    if ($ToolCall.globToolCall) {
        $pattern = $ToolCall.globToolCall.args.globPattern
        if ($Phase -eq "completed") {
            $files = @($ToolCall.globToolCall.result.success.files)
            return "GLOB OK   $pattern -> $($files.Count) file(s)"
        }
        return "GLOB      $pattern"
    }

    if ($ToolCall.grepToolCall) {
        return "GREP      $($ToolCall.grepToolCall.args.pattern)"
    }

    $keys = @($ToolCall.PSObject.Properties.Name)
    if ($keys.Count -gt 0) { return "$($keys[0])" }
    return "tool"
}

function Format-AgentStreamLine {
    param(
        [string]$JsonLine,
        [switch]$ShowThinking,
        [switch]$ShowAssistantStream
    )

    if ($PSBoundParameters.ContainsKey('ShowThinking')) {
        $script:AgentStreamShowThink = [bool]$ShowThinking
    }

    if (-not $JsonLine -or -not $JsonLine.Trim()) { return }

    $event = ConvertFrom-AgentStreamJson -JsonLine $JsonLine
    if (-not $event) {
        if ($JsonLine -match '"type"\s*:\s*"(thinking)"') {
            if ($JsonLine -match '"subtype"\s*:\s*"delta"') {
                if ($JsonLine -match '"text"\s*:\s*"((?:\\.|[^"\\])*)"') {
                    if ($script:AgentStreamShowThink) {
                        $chunk = $Matches[1] -replace '\\n', "`n"
                        [void]$script:AgentStreamThinkingBuffer.Append($chunk)
                    }
                }
                return
            }
            if ($JsonLine -match '"subtype"\s*:\s*"completed"' -and $script:AgentStreamShowThink) {
                $text = $script:AgentStreamThinkingBuffer.ToString().Trim()
                if ($text) {
                    if ($text.Length -gt 300) { $text = $text.Substring(0, 297) + "..." }
                    Write-AgentStreamLine "THINK" $text "DarkGray" | Out-Null
                }
                [void]$script:AgentStreamThinkingBuffer.Clear()
                return
            }
        }
        if ($JsonLine -match '"type"\s*:\s*"result"') {
            if ($JsonLine -match '"duration_ms"\s*:\s*(\d+)') {
                $duration = [math]::Round([double]$Matches[1] / 1000, 1)
                Write-AgentStreamLine "DONE" "OK in ${duration}s" "Cyan" | Out-Null
            }
            if ($JsonLine -match '"result"\s*:\s*"((?:\\.|[^"\\])*)"') {
                $result = $Matches[1] -replace '\\n', ' '
                if ($result.Length -gt 500) { $result = $result.Substring(0, 497) + "..." }
                Write-AgentStreamLine "RESULT" $result "Green" | Out-Null
            }
        }
        return
    }

    switch ($event.type) {
        "system" {
            if ($event.subtype -eq "init") {
                Write-AgentStreamLine "INIT" "model=$($event.model) cwd=$($event.cwd) session=$($event.session_id)" "Cyan" | Out-Null
            }
        }
        "thinking" {
            if ($event.subtype -eq "delta" -and $script:AgentStreamShowThink) {
                [void]$script:AgentStreamThinkingBuffer.Append($event.text)
            }
            elseif ($event.subtype -eq "completed" -and $script:AgentStreamShowThink) {
                $text = $script:AgentStreamThinkingBuffer.ToString().Trim()
                if ($text) {
                    if ($text.Length -gt 300) { $text = $text.Substring(0, 297) + "..." }
                    Write-AgentStreamLine "THINK" $text "DarkGray" | Out-Null
                }
                [void]$script:AgentStreamThinkingBuffer.Clear()
            }
        }
        "assistant" {
            $hasTs = $null -ne $event.timestamp_ms
            $hasMc = $null -ne $event.model_call_id
            $text = $event.message.content[0].text
            if (-not $text) { break }

            if ($ShowAssistantStream -and $hasTs -and -not $hasMc) { break }

            if ($hasMc -or (-not $hasTs)) {
                $oneLine = ($text -replace "\s+", " ").Trim()
                if ($oneLine.Length -gt 240) { $oneLine = $oneLine.Substring(0, 237) + "..." }
                if ($oneLine) { Write-AgentStreamLine "SAY" $oneLine "White" | Out-Null }
            }
        }
        "tool_call" {
            $summary = Get-AgentToolCallSummary -ToolCall $event.tool_call -Phase $event.subtype
            if ($event.subtype -eq "started") {
                $script:AgentStreamToolCount++
                Write-AgentStreamLine ("T{0:D2}" -f $script:AgentStreamToolCount) $summary "Yellow" | Out-Null
            }
            else {
                Write-AgentStreamLine ("T{0:D2}" -f $script:AgentStreamToolCount) $summary "Green" | Out-Null
            }
        }
        "result" {
            $duration = [math]::Round($event.duration_ms / 1000, 1)
            $status = if ($event.is_error) { "ERROR" } else { "OK" }
            Write-AgentStreamLine "DONE" "$status in ${duration}s" "Cyan" | Out-Null
            if ($event.result) {
                $result = ($event.result -replace "\s+", " ").Trim()
                if ($result.Length -gt 500) { $result = $result.Substring(0, 497) + "..." }
                Write-AgentStreamLine "RESULT" $result "Green" | Out-Null
            }
        }
        default { }
    }
}
