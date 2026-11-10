#include "FxRack.h"
#include "Fx.h"
#include <algorithm>
#include <cstring>

namespace visu {

std::shared_ptr<FxRack> FxRack::build(const std::string& json, double sampleRate, std::string& error) {
    auto lib = Library::fromFx(json, error, sampleRate);
    if (!lib) return nullptr;
    auto r = std::make_shared<FxRack>();
    r->lib_ = std::move(lib);
    r->c_.sampleRate = sampleRate; r->c_.tags = r->lib_->tagValues.get(); r->c_.numTags = (int) r->lib_->tags.size();
    r->c_.gate = false; r->c_.key = 60; r->c_.vel = 0;
    return r;
}

int FxRack::tagIndex(const std::string& s) const {
    for (size_t i = 0; i < lib_->tags.size(); ++i) if (lib_->tags[i].id == s || lib_->tags[i].name == s) return (int) i;
    return -1;
}

void FxRack::process(float* l, float* r, int n) {
    fx::System& s = *lib_->fx;
    for (int at = 0; at < n; at += fx::kBlock) {
        const int m = std::min(fx::kBlock, n - at);
        fx::Stereo& in = s.groupIn(-1);
        std::memcpy(in.l, l + at, sizeof(float) * (size_t) m); std::memcpy(in.r, r + at, sizeof(float) * (size_t) m);
        s.process(m, c_);
        const fx::Stereo& o = s.out();
        std::memcpy(l + at, o.l, sizeof(float) * (size_t) m); std::memcpy(r + at, o.r, sizeof(float) * (size_t) m);
        c_.time += m / c_.sampleRate;
    }
}

} // namespace visu
