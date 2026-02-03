"""
自动搜索逻辑测试：连续两次对话画像无变化时触发自动搜索
"""
import sys
import os
from unittest.mock import patch, MagicMock

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)

from src.core.ai.conversation_handler import ConversationHandler


def test_profile_unchanged():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    assert handler._profile_unchanged(
        {'skills': ['python'], 'contribution_styles': ['bug_fix']},
        {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    ) is True
    assert handler._profile_unchanged(
        {'skills': [], 'contribution_styles': []},
        {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    ) is False
    assert handler._profile_unchanged(
        {'skills': ['python', 'react'], 'contribution_styles': ['docs']},
        {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    ) is False
    assert handler._profile_unchanged(
        {'skills': ['python'], 'contribution_styles': []},
        {'skills': ['python'], 'contribution_styles': []}
    ) is True
    print("test_profile_unchanged: OK")


def test_is_profile_sufficient():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    assert handler._is_profile_sufficient({'skills': ['python'], 'contribution_styles': ['bug_fix']}) is True
    assert handler._is_profile_sufficient({'skills': ['python'], 'contribution_styles': []}) is False
    assert handler._is_profile_sufficient({'skills': [], 'contribution_styles': ['docs']}) is False
    assert handler._is_profile_sufficient({'skills': [], 'contribution_styles': []}) is False
    print("test_is_profile_sufficient: OK")


def test_handle_auto_search_chinese():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    handler.current_profile = {'skills': ['python', 'django'], 'contribution_styles': ['bug_fix', 'docs']}
    out = handler._handle_auto_search('chinese')
    assert out['action'] == 'SEARCH_PROJECTS'
    assert out['data'].get('auto_search') is True
    assert 'python' in out['reply'] and 'django' in out['reply']
    assert '修复bug' in out['reply'] or '编写文档' in out['reply']
    assert '搜索' in out['reply']
    print("test_handle_auto_search_chinese: OK")


def test_handle_auto_search_english():
    handler = ConversationHandler(user_id=None, user_language='english')
    handler.current_profile = {'skills': ['python', 'react'], 'contribution_styles': ['feature', 'docs']}
    out = handler._handle_auto_search('english')
    assert out['action'] == 'SEARCH_PROJECTS'
    assert out['data'].get('auto_search') is True
    assert 'python' in out['reply'] and 'react' in out['reply']
    assert 'searching' in out['reply'].lower()
    print("test_handle_auto_search_english: OK")


def test_process_user_input_triggers_auto_search_when_profile_unchanged():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    handler.current_profile = {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    handler.previous_profile = {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    handler.conversation_history = [
        {'role': 'user', 'content': '我会python'},
        {'role': 'assistant', 'content': '好的'},
        {'role': 'user', 'content': '再补充一下'}
    ]
    handler.historical_summary = "User: 我会python\nAssistant: 好的\nUser: 再补充一下"

    with patch.object(handler.profile_parser, 'parse_profile', return_value={'skills': ['python'], 'contribution_styles': ['bug_fix']}):
        result = handler.process_user_input("再补充一下")
    assert result['action'] == 'SEARCH_PROJECTS'
    assert result['data'].get('auto_search') is True
    assert '搜索' in result['reply']
    print("test_process_user_input_triggers_auto_search_when_profile_unchanged: OK")


def test_process_user_input_no_auto_search_when_profile_changed():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    handler.current_profile = {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    handler.previous_profile = {'skills': ['python'], 'contribution_styles': ['bug_fix']}
    handler.conversation_history = [{'role': 'user', 'content': '我会python'}, {'role': 'assistant', 'content': '好的'}]
    handler.historical_summary = "User: 我会python\nAssistant: 好的"

    with patch.object(handler.profile_parser, 'parse_profile', return_value={'skills': ['python', 'react'], 'contribution_styles': ['bug_fix']}):
        with patch.object(handler.provider, 'generate', return_value="好的，已记录你的技能。"):
            result = handler.process_user_input("我还会react")
    assert result['action'] != 'SEARCH_PROJECTS' or result['data'].get('auto_search') is not True
    print("test_process_user_input_no_auto_search_when_profile_changed: OK")


def test_process_user_input_no_auto_search_when_profile_insufficient():
    handler = ConversationHandler(user_id=None, user_language='chinese')
    handler.current_profile = {'skills': ['python'], 'contribution_styles': []}
    handler.previous_profile = {'skills': ['python'], 'contribution_styles': []}
    handler.conversation_history = [{'role': 'user', 'content': '我会python'}, {'role': 'assistant', 'content': '好的'}]
    handler.historical_summary = "User: 我会python\nAssistant: 好的"

    with patch.object(handler.profile_parser, 'parse_profile', return_value={'skills': ['python'], 'contribution_styles': []}):
        with patch.object(handler.provider, 'generate', return_value="你更喜欢什么类型的贡献？"):
            result = handler.process_user_input("没啥偏好")
    assert result['data'].get('auto_search') is not True
    print("test_process_user_input_no_auto_search_when_profile_insufficient: OK")


if __name__ == "__main__":
    test_profile_unchanged()
    test_is_profile_sufficient()
    test_handle_auto_search_chinese()
    test_handle_auto_search_english()
    test_process_user_input_triggers_auto_search_when_profile_unchanged()
    test_process_user_input_no_auto_search_when_profile_changed()
    test_process_user_input_no_auto_search_when_profile_insufficient()
    print("\nAll auto-search tests passed.")
