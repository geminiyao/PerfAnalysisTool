"""Check marker search, per-frame totals and scoped evidence in the published CPU reports."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def verify(base):
    with sync_playwright() as runtime:
        chrome = Path('C:/Program Files/Google/Chrome/Application/chrome.exe')
        browser = runtime.chromium.launch(executable_path=str(chrome) if chrome.exists() else None)
        page = browser.new_page(viewport={'width':1440,'height':900})
        page.set_default_timeout(60000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        marker = 'MUI.ReadFile'
        page.goto(base+'/map-roundtrip-zoom-20261124/report.html#index?k=H')
        page.locator('#idxq').fill('readfile')
        result = page.locator('#idxresults tbody tr').filter(has_text=marker)
        result.get_by_role('link',name='全部 49 帧').click()
        detail = page.locator('#marker-frame-table')
        rows = detail.locator('tbody tr')
        expect(rows.first).to_be_visible()
        values = []
        for part in range(3):
            values += [r.locator('td').all_inner_texts() for r in rows.all()]
            if part < 2:
                detail.get_by_role('button',name='下一页').click()
        assert len(values) == len({r[0] for r in values}) == 49
        assert sum(int(r[2]) for r in values) == 280
        assert abs(sum(float(r[3]) for r in values)-51.45171) < .01
        page.locator('#marker-frame-filter').select_option('heavy')
        expected = ['F21','F22','F23','F96','F98','F100','F102','F467','F474']
        assert rows.locator('td:first-child').all_inner_texts() == expected
        page.locator('#marker-frame-sort').select_option('total')
        expect(rows.first.locator('td').first).to_have_text('F21')
        selected = rows.filter(has=page.get_by_role('cell',name='F22',exact=True))
        assert selected.locator('td').all_inner_texts()[1:7] == ['45.06','3','4.074','4.074','1.358','4.043']
        for frame, action in [('F22','Timeline'),('F98','调用树')]:
            rows.filter(has=page.get_by_role('cell',name=frame,exact=True)).get_by_role('link',name=action).click()
            if action == 'Timeline':
                expect(page.locator('#frame-timeline[data-ready=true] .ft-detail')).to_contain_text(marker)
            else:
                expect(page.locator('#treeres h3')).to_contain_text(marker)
            assert 'i=4209' in page.url
            page.go_back()
            expect(rows).to_have_count(9)
            expect(page.locator('#marker-frame-sort')).to_have_value('total')
        page.get_by_role('link',name='‹ 返回 Marker 搜索结果').click()
        expect(page.locator('#idxq')).to_have_value('readfile')
        expect(result).to_have_count(1)
        # Two identical marker names with different parents must stay distinct.
        page.goto(base+'/map220-city-slide-20261124/report.html#index?k=A&q=Loading.ArchiveFileSystemRead')
        branches = page.locator('#idxresults tbody tr')
        expect(branches.first).to_be_visible()
        assert branches.count() >= 2
        for i in (0,1):
            row = branches.nth(i)
            thread = row.locator('td').first.inner_text()
            full_path = row.locator('details small').text_content()
            link = row.locator('a[href*="marker-frames"]')
            n = int(link.inner_text().split()[1])
            link.click()
            expect(detail).to_be_visible()
            expect(page.locator('#marker-frame-results details p')).to_have_text(full_path)
            expect(page.locator('#marker-frame-results p').nth(1)).to_contain_text(thread)
            expect(page.locator('#marker-frame-results table').first.locator('tbody td').first).to_have_text(str(n))
            page.get_by_role('link',name='‹ 返回 Marker 搜索结果').click()
            expect(branches.first).to_be_visible()
        page.goto(base+'/map-roundtrip-zoom-20261124/report.html#marker-frames?k=H&i=2179')
        expect(rows.first).to_be_visible()
        rows.first.get_by_role('link',name='Timeline').click()
        expect(page.locator('#frame-timeline[data-ready=true] .ft-detail')).to_contain_text('TextureStreamingManager.UpdateCameras')
        expect(page.locator('[data-ctl=thread] option:checked')).to_have_text('Job / Worker 2')
        page.set_viewport_size({'width':390,'height':844})
        page.goto(base+'/map-roundtrip-zoom-20261124/report.html#marker-frames?k=H&i=4209&min=1')
        expect(rows).to_have_count(9)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert not errors, errors
        browser.close()
        print('Validated 49 frames, 280 calls, nine heavy frames, scoped evidence, navigation and mobile layout.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base',default=(Path(__file__).resolve().parents[2]/'web/public/report').as_uri())
    verify(parser.parse_args().base.rstrip('/'))
