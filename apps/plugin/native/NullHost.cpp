// VisuMakerAudio without a sound card: reads commands from stdin and renders in real time into nothing.
// Used to test VisuMaker's native-audio bridge on machines without audio (CI, Linux), and with --render for tests:
//   --render N   after stdin closes, render N frames and print their peak and RMS (and the loaded/voices replies)
#include "HelperCore.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <thread>

using namespace visu;

int main(int argc, char** argv) {
    long renderFrames = 0; for (int i = 1; i + 1 < argc; ++i) if (!std::strcmp(argv[i], "--render")) renderFrames = std::atol(argv[i + 1]);
    HelperCore core; core.send = [](const std::string& s) { std::fwrite(s.data(), 1, s.size(), stdout); std::fputc('\n', stdout); std::fflush(stdout); };
    core.prepare(48000, 128);
    std::printf("{\"t\":\"ready\",\"native\":true,\"device\":\"(no sound card)\",\"rate\":48000,\"buffer\":128,\"latencyMs\":2.7}\n"); std::fflush(stdout);
    std::atomic<bool> running{ true };
    std::thread audio;
    if (!renderFrames) audio = std::thread([&] {   // a fake sound card: 128 frames every 2.67 ms
        std::vector<float> L(128), R(128); auto next = std::chrono::steady_clock::now(); int k = 0;
        while (running) { core.render(L.data(), R.data(), 128); if (++k % 12 == 0) core.tick(); next += std::chrono::microseconds(2667); std::this_thread::sleep_until(next); }
    });
    std::string line;
    while (std::getline(std::cin, line)) { if (!line.empty() && line.back() == '\r') line.pop_back(); if (!line.empty()) core.command(line); }
    running = false; if (audio.joinable()) audio.join();
    if (renderFrames) {
        std::vector<float> L(128), R(128); double pk = 0, sq = 0; long n = 0;
        for (long f = 0; f < renderFrames; f += 128) { core.render(L.data(), R.data(), 128); for (int i = 0; i < 128; ++i) { pk = std::max(pk, (double) std::fabs(L[i])); sq += (double) L[i] * L[i]; ++n; } if ((f / 128) % 12 == 0) core.tick(); }
        std::printf("{\"t\":\"rendered\",\"peak\":%.6f,\"rms\":%.6f}\n", pk, std::sqrt(sq / std::max(1L, n)));
    }
    return 0;
}
