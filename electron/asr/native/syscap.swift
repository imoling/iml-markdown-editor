// syscap：把这台 Mac 正在播放的声音（网课、线上会议里对方的声音）抓出来，转成 16 kHz 单声道 float32 PCM 写到标准输出，
// 直到标准输入被关掉（父进程退出或主动关掉）。走 ScreenCaptureKit 的音频通道（macOS 13+），需要「屏幕录制」权限。
// 标准错误上：ready = 开始抓了；error: … = 出错。退出码 2 = 没有权限。
// 编译：scripts/build-syscap.mjs（产物 build/bin/syscap，打包时放进 Resources/bin/）
import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

final class Sink: NSObject, SCStreamOutput, SCStreamDelegate {
    let out = FileHandle.standardOutput
    let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
    var format: AVAudioFormat?
    var converter: AVAudioConverter?

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, let fmtDesc = CMSampleBufferGetFormatDescription(sampleBuffer), let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmtDesc) else { return }
        if format == nil {
            format = AVAudioFormat(streamDescription: asbd)
            converter = AVAudioConverter(from: format!, to: target)
        }
        guard let format, let converter else { return }
        let numSamples = CMSampleBufferGetNumSamples(sampleBuffer)
        guard numSamples > 0, let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(numSamples)) else { return }
        pcm.frameLength = AVAudioFrameCount(numSamples)
        guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer, at: 0, frameCount: Int32(numSamples), into: pcm.mutableAudioBufferList) == noErr else { return }
        let outCap = AVAudioFrameCount(Double(numSamples) * 16000 / format.sampleRate) + 16
        guard let converted = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: outCap) else { return }
        var consumed = false
        var err: NSError?
        converter.convert(to: converted, error: &err) { _, statusPtr in
            if consumed { statusPtr.pointee = .noDataNow; return nil }
            consumed = true; statusPtr.pointee = .haveData; return pcm
        }
        if err != nil { return }
        let n = Int(converted.frameLength)
        if n == 0 { return }
        out.write(Data(bytes: converted.floatChannelData![0], count: n * 4))
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        log("error: stream stopped: \(error.localizedDescription)")
        exit(1)
    }
}

let sink = Sink()
var stream: SCStream?

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else { throw NSError(domain: "syscap", code: 1, userInfo: [NSLocalizedDescriptionKey: "没有找到显示器"]) }
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.excludesCurrentProcessAudio = true
        cfg.sampleRate = 48000
        cfg.channelCount = 2
        // 画面只要最小的：我们不收视频样本
        cfg.width = 2
        cfg.height = 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: cfg, delegate: sink)
        try s.addStreamOutput(sink, type: .audio, sampleHandlerQueue: DispatchQueue(label: "syscap.audio"))
        try await s.startCapture()
        stream = s
        log("ready")
    } catch {
        let ns = error as NSError
        // SCStreamErrorUserDeclined = -3801：用户在「屏幕录制」里没放行
        let declined = ns.code == -3801 || ns.localizedDescription.lowercased().contains("declined") || ns.localizedDescription.contains("权限")
        log("error: \(ns.localizedDescription) (\(ns.domain) \(ns.code))")
        exit(declined ? 2 : 1)
    }
}

// 标准输入一关（父进程退出、或主动关掉），就停
DispatchQueue.global().async {
    while readLine() != nil { }
    Task {
        try? await stream?.stopCapture()
        exit(0)
    }
}
RunLoop.main.run()
